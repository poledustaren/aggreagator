package ru.aggregat.app.work

import android.content.Context
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import ru.aggregat.app.AggregatApp
import ru.aggregat.app.data.repository.UploadResult

private const val TAG = "UploadWorker"

/**
 * Worker, отправляющий накопленные PENDING-уведомления батчами по 100.
 * Гоняет цикл "взять батч -> отправить" до тех пор, пока очередь не опустеет
 * или не случится ошибка, требующая остановки (сеть недоступна / сервер 5xx / 401).
 *
 * WorkManager сам обеспечивает retry с экспоненциальным backoff при Result.retry()
 * (см. настройку backoffCriteria в UploadScheduler).
 */
class UploadWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    /**
     * Нужен для expedited-запуска на Android < 12: там задача выполняется как
     * foreground service и обязана показать уведомление. На Android 12+ система
     * использует expedited job и это уведомление не показывается.
     */
    override suspend fun getForegroundInfo(): ForegroundInfo {
        val notification = NotificationCompat.Builder(applicationContext, UPLOAD_CHANNEL_ID)
            .setContentTitle("Aggregat")
            .setContentText("Отправка уведомлений…")
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        return ForegroundInfo(UPLOAD_NOTIFICATION_ID, notification)
    }

    override suspend fun doWork(): Result {
        val app = applicationContext as AggregatApp
        val repository = app.repository

        // Периодическая чистка старых отправленных записей (старше 7 дней),
        // чтобы локальная БД не росла бесконечно на устройстве.
        repository.pruneOldSent(olderThanMillis = SEVEN_DAYS_MILLIS)

        var totalAccepted = 0
        var totalDuplicates = 0

        while (true) {
            when (val result = repository.uploadPendingBatch()) {
                is UploadResult.Success -> {
                    totalAccepted += result.accepted
                    totalDuplicates += result.duplicates
                    // Если батч был меньше лимита — значит очередь исчерпана, но
                    // проще и надёжнее просто повторить uploadPendingBatch: он вернёт
                    // NothingToSend и мы выйдем из цикла.
                }
                UploadResult.NothingToSend -> {
                    Log.i(TAG, "Очередь пуста. Итого за сессию: accepted=$totalAccepted duplicates=$totalDuplicates")
                    return Result.success()
                }
                UploadResult.NetworkError -> {
                    Log.w(TAG, "Сеть недоступна — запрашиваем retry с backoff")
                    return Result.retry()
                }
                UploadResult.Unauthorized -> {
                    // Токен сброшен репозиторием (settingsStore.clearRegistration()).
                    // Требуется участие пользователя (повторная регистрация в UI) —
                    // retry здесь не поможет, поэтому завершаем работу с неуспехом,
                    // но БЕЗ бесконечных попыток.
                    Log.e(TAG, "401: токен невалиден, устройство разрегистрировано")
                    return Result.failure()
                }
                is UploadResult.ClientError -> {
                    Log.e(TAG, "Сервер отверг батч (${result.code}), retry не поможет")
                    return Result.failure()
                }
                is UploadResult.ServerError -> {
                    Log.w(TAG, "Ошибка сервера (${result.code}) — запрашиваем retry с backoff")
                    return Result.retry()
                }
            }
        }
    }

    companion object {
        const val WORK_NAME_PERIODIC = "aggregat_upload_periodic"
        const val WORK_NAME_IMMEDIATE = "aggregat_upload_immediate"
        const val UPLOAD_CHANNEL_ID = "aggregat_upload"
        private const val UPLOAD_NOTIFICATION_ID = 4711
        private const val SEVEN_DAYS_MILLIS = 7L * 24 * 60 * 60 * 1000
    }
}
