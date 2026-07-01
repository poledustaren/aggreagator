package ru.aggregat.app.service

import android.app.Notification
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import ru.aggregat.app.AggregatApp
import ru.aggregat.app.work.UploadScheduler

private const val TAG = "NotifListener"

/**
 * Ловит ВСЕ системные уведомления через NotificationListenerService API.
 * Требует явного разрешения пользователя (Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS),
 * т.к. привязан к системному permission BIND_NOTIFICATION_LISTENER_SERVICE.
 *
 * Логика перехвата держим МИНИМАЛЬНОЙ и быстрой: onNotificationPosted вызывается
 * в основном потоке системного биндера, тяжёлая работа (запись в Room) уходит
 * в корутину на IO-диспетчере.
 */
class AggregatNotificationListenerService : NotificationListenerService() {

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "NotificationListenerService подключён к системе")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "NotificationListenerService отключён системой — запрашиваем перепривязку")
        // Просим систему заново привязать слушателя. Без этого на агрессивных прошивках
        // окно между отключением и авто-ребиндом может быть долгим, и уведомления,
        // пришедшие в это время, не попадут даже в очередь (единственное место потери).
        try {
            requestRebind(
                android.content.ComponentName(
                    applicationContext,
                    AggregatNotificationListenerService::class.java,
                ),
            )
        } catch (e: Exception) {
            Log.e(TAG, "Не удалось запросить перепривязку слушателя", e)
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        super.onNotificationPosted(sbn)
        handleNotification(sbn)
    }

    private fun handleNotification(sbn: StatusBarNotification) {
        // Свои собственные уведомления не шлём — иначе можно уйти в петлю,
        // если сервер начнёт слать статус обратно через push-уведомления.
        if (sbn.packageName == packageName) {
            return
        }

        val notification = sbn.notification ?: return

        // Ongoing/foreground-service уведомления (таймеры, музыка, загрузки, "приложение работает
        // в фоне") — это не "события", требующие внимания пользователя, а служебный шум.
        // FLAG_ONGOING_EVENT — официальный флаг именно для этого случая.
        if (notification.flags and Notification.FLAG_ONGOING_EVENT != 0) {
            return
        }
        // FLAG_FOREGROUND_SERVICE тоже исключаем отдельно на случай, если ongoing не выставлен,
        // но уведомление всё равно служебное (foreground service notification).
        if (notification.flags and Notification.FLAG_FOREGROUND_SERVICE != 0) {
            return
        }
        // Групповая summary-нотификация без собственного контента (используется системой
        // для объединения бандла) — извлекать из неё нечего, реальные данные придут
        // отдельными onNotificationPosted для дочерних уведомлений.
        if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) {
            return
        }

        val extras = notification.extras
        val title = extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val text = extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString()
        val subtext = extras?.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()

        if (title.isNullOrBlank() && text.isNullOrBlank()) {
            // Пустые уведомления (например, чисто иконка-статус) не шлём — нет
            // полезной нагрузки для сервера.
            return
        }

        val appLabel = resolveAppLabel(sbn.packageName)
        val category = notification.category
        val clientId = ClientIdGenerator.generate(sbn.key, sbn.postTime)
        val postedAtIso = IsoTime.format(sbn.postTime)
        val extrasJson = buildExtrasJson(sbn)

        serviceScope.launch {
            try {
                val app = applicationContext as AggregatApp
                app.repository.enqueue(
                    clientId = clientId,
                    sourceApp = sbn.packageName,
                    appLabel = appLabel,
                    title = title,
                    text = text,
                    subtext = subtext,
                    category = category,
                    postedAtIso = postedAtIso,
                    extrasJson = extrasJson,
                )
                // Триггерим немедленную (expedited) отправку после каждого уведомления —
                // доставка за секунды, не ждём периодического окна WorkManager.
                UploadScheduler.maybeTriggerImmediateUpload(applicationContext)
            } catch (e: Exception) {
                Log.e(TAG, "Ошибка записи уведомления в очередь", e)
            }
        }
    }

    private fun resolveAppLabel(packageName: String): String? {
        return try {
            val pm = applicationContext.packageManager
            val appInfo = pm.getApplicationInfo(packageName, PackageManager.ApplicationInfoFlags.of(0))
            pm.getApplicationLabel(appInfo).toString()
        } catch (e: PackageManager.NameNotFoundException) {
            null
        }
    }

    /**
     * Небольшой набор дополнительных полей в extras: android category уже отдельным
     * полем, здесь сохраняем posted-время как epoch (для отладки на сервере) и
     * package uid/tag, если пригодятся классификатору сервера.
     */
    private fun buildExtrasJson(sbn: StatusBarNotification): String? {
        val obj = buildJsonObject {
            put("post_time_epoch_ms", JsonPrimitive(sbn.postTime))
            sbn.notification?.channelId?.let { put("channel_id", JsonPrimitive(it)) }
            put("is_clearable", JsonPrimitive(sbn.isClearable))
        }
        return if (obj.isEmpty()) null else Json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), obj)
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceJob.cancel()
    }
}
