package ru.aggregat.app.data.repository

import android.util.Log
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import retrofit2.HttpException
import ru.aggregat.app.data.local.AggregatDatabase
import ru.aggregat.app.data.local.DeviceSettingsStore
import ru.aggregat.app.data.local.PendingNotification
import ru.aggregat.app.data.local.SendStatus
import ru.aggregat.app.data.remote.ApiClientFactory
import ru.aggregat.app.data.remote.DeviceRegisterRequest
import ru.aggregat.app.data.remote.IngestRequest
import ru.aggregat.app.data.remote.RawNotificationDto
import java.io.IOException

/**
 * Результат попытки отправки батча — нужен, чтобы Worker мог принять решение
 * о retry/backoff, не зная деталей HTTP.
 */
sealed class UploadResult {
    data class Success(val accepted: Int, val duplicates: Int) : UploadResult()

    /** Сеть недоступна / таймаут — стоит повторить позже (retry). */
    data object NetworkError : UploadResult()

    /** 401 — токен невалиден, нужна перерегистрация устройства. */
    data object Unauthorized : UploadResult()

    /** 4xx (кроме 401) — сервер отверг запрос, повторять с теми же данными бессмысленно. */
    data class ClientError(val code: Int) : UploadResult()

    /** 5xx — временная проблема сервера, стоит повторить (retry). */
    data class ServerError(val code: Int) : UploadResult()

    data object NothingToSend : UploadResult()
}

sealed class RegistrationResult {
    data object Success : RegistrationResult()
    data object NetworkError : RegistrationResult()
    data class Failure(val code: Int?, val message: String?) : RegistrationResult()
}

private const val TAG = "NotificationRepository"
private const val BATCH_SIZE = 100

/**
 * Единая точка входа для работы с уведомлениями: локальная запись (Room) +
 * попытка отправки на сервер (Retrofit). NotificationListenerService и
 * UploadWorker обращаются только сюда, не работая с DAO/API напрямую.
 */
class NotificationRepository(
    private val database: AggregatDatabase,
    private val settingsStore: DeviceSettingsStore,
) {

    private val json = Json { ignoreUnknownKeys = true }

    val pendingCount: Flow<Int> get() = database.pendingNotificationDao().observePendingCount()
    val sentCount: Flow<Int> get() = database.pendingNotificationDao().observeSentCount()

    /** Совмещённый статус для UI: (pending, sent). */
    fun observeCounters(): Flow<Pair<Int, Int>> =
        combine(pendingCount, sentCount) { pending, sent -> pending to sent }

    /**
     * Сохраняет уведомление в локальную очередь. Пустые уведомления (нет ни title,
     * ни text) сюда попадать не должны — фильтрация на уровне вызывающего кода
     * (NotificationListenerService), но на всякий случай дублируем защиту здесь.
     */
    suspend fun enqueue(
        clientId: String,
        sourceApp: String,
        appLabel: String?,
        title: String?,
        text: String?,
        subtext: String?,
        category: String?,
        postedAtIso: String,
        /** Уже сериализованный в JSON-строку объект extras (или null, если пусто). */
        extrasJson: String?,
    ) {
        if (title.isNullOrBlank() && text.isNullOrBlank()) {
            Log.d(TAG, "Пропущено пустое уведомление от $sourceApp (нет title и text)")
            return
        }

        val entity = PendingNotification(
            clientId = clientId,
            sourceApp = sourceApp,
            appLabel = appLabel,
            title = title,
            text = text,
            subtext = subtext,
            category = category,
            postedAt = postedAtIso,
            extrasJson = extrasJson,
        )
        database.pendingNotificationDao().insert(entity)
    }

    /**
     * Отправляет один батч (до BATCH_SIZE) накопленных PENDING-уведомлений.
     * При успехе (202) помечает их SENT. Пустая очередь — NothingToSend, вызывающий
     * код (Worker) может по этому сигналу остановиться, не перезапуская себя.
     */
    suspend fun uploadPendingBatch(): UploadResult {
        val baseUrl = settingsStore.getBaseUrl()
        val token = settingsStore.getDeviceToken()
        if (baseUrl.isNullOrBlank() || token.isNullOrBlank()) {
            Log.w(TAG, "Устройство не настроено (нет baseUrl или токена) — отправка отменена")
            return UploadResult.NetworkError
        }

        val dao = database.pendingNotificationDao()
        val batch = dao.getBatch(SendStatus.PENDING, BATCH_SIZE)
        if (batch.isEmpty()) {
            return UploadResult.NothingToSend
        }

        val api = ApiClientFactory.create(baseUrl, settingsStore)
        val dtoList = batch.map { it.toDto(json) }

        return try {
            val response = api.ingestNotifications(IngestRequest(dtoList))
            if (response.isSuccessful) {
                val body = response.body()
                dao.updateStatus(batch.map { it.id }, SendStatus.SENT)
                Log.i(TAG, "Батч отправлен: accepted=${body?.accepted} duplicates=${body?.duplicates}")
                UploadResult.Success(body?.accepted ?: 0, body?.duplicates ?: 0)
            } else {
                handleErrorResponse(response.code())
            }
        } catch (e: HttpException) {
            handleErrorResponse(e.code())
        } catch (e: IOException) {
            Log.w(TAG, "Сеть недоступна при отправке батча", e)
            UploadResult.NetworkError
        }
    }

    private fun handleErrorResponse(code: Int): UploadResult {
        return when {
            code == 401 -> {
                Log.w(TAG, "401 от сервера — токен невалиден, сбрасываем регистрацию")
                settingsStore.clearRegistration()
                UploadResult.Unauthorized
            }
            code in 500..599 -> UploadResult.ServerError(code)
            code in 400..499 -> UploadResult.ClientError(code)
            else -> UploadResult.ServerError(code)
        }
    }

    /**
     * Регистрирует устройство на сервере (POST /v1/devices:register) и сохраняет
     * device_id + token локально. Вызывается при первом запуске или после
     * сброса токена (401).
     */
    suspend fun registerDevice(baseUrl: String, deviceName: String, password: String? = null): RegistrationResult {
        return try {
            val api = ApiClientFactory.create(baseUrl, settingsStore)
            val response = api.registerDevice(
                DeviceRegisterRequest(deviceName = deviceName, password = password?.takeIf { it.isNotBlank() }),
            )
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    settingsStore.setBaseUrl(baseUrl)
                    settingsStore.saveRegistration(body.deviceId, body.token)
                    RegistrationResult.Success
                } else {
                    RegistrationResult.Failure(response.code(), "Пустой ответ сервера")
                }
            } else {
                RegistrationResult.Failure(response.code(), response.errorBody()?.string())
            }
        } catch (e: IOException) {
            Log.w(TAG, "Сеть недоступна при регистрации устройства", e)
            RegistrationResult.NetworkError
        }
    }

    suspend fun pruneOldSent(olderThanMillis: Long) {
        val threshold = System.currentTimeMillis() - olderThanMillis
        val removed = database.pendingNotificationDao().deleteSentOlderThan(threshold)
        if (removed > 0) {
            Log.d(TAG, "Удалено $removed старых отправленных записей")
        }
    }

    private fun PendingNotification.toDto(json: Json): RawNotificationDto {
        val extras: JsonObject? = extrasJson?.let {
            runCatching { json.parseToJsonElement(it) as? JsonObject }.getOrNull()
        }
        return RawNotificationDto(
            clientId = clientId,
            sourceApp = sourceApp,
            appLabel = appLabel,
            title = title,
            text = text,
            subtext = subtext,
            category = category,
            postedAt = postedAt,
            extras = extras,
        )
    }
}
