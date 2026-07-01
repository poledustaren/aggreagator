package ru.aggregat.app.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import ru.aggregat.app.data.repository.NotificationRepository
import java.util.concurrent.TimeUnit

/**
 * Планировщик фоновой отправки:
 *  - периодическая задача каждые 15 минут (минимальный интервал WorkManager) — как
 *    страховочная «уборка» очереди;
 *  - EXPEDITED-триггер на КАЖДОЕ новое уведомление — доставка за секунды, минуя Doze.
 * Expedited-задачи выполняются вне обычной отложенной очереди; при исчерпании квоты
 * системы падаем в обычный OneTimeWork (RUN_AS_NON_EXPEDITED_WORK_REQUEST), т.е. без
 * потери — просто чуть позже. Уникальность (KEEP) не даёт плодить параллельные отправки:
 * один Worker всё равно вычёрпывает всю очередь батчами.
 */
object UploadScheduler {

    private const val PERIODIC_INTERVAL_MINUTES = 15L

    // WorkManager требует backoff не меньше своего внутреннего минимума (~10 сек);
    // берём 30 сек с запасом.
    private const val MIN_BACKOFF_MILLIS = 30_000L

    fun schedulePeriodic(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = PeriodicWorkRequestBuilder<UploadWorker>(
            PERIODIC_INTERVAL_MINUTES, TimeUnit.MINUTES,
        )
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            UploadWorker.WORK_NAME_PERIODIC,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    /**
     * Разовый EXPEDITED-запуск отправки — по кнопке «Отправить сейчас» или
     * автоматически после каждого пойманного уведомления.
     */
    fun triggerImmediate(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = OneTimeWorkRequestBuilder<UploadWorker>()
            .setConstraints(constraints)
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            UploadWorker.WORK_NAME_IMMEDIATE,
            ExistingWorkPolicy.KEEP, // не дублируем, если уже запущена — Worker вычёрпывает всё
            request,
        )
    }

    /**
     * Вызывается из NotificationListenerService после каждой записи в очередь —
     * сразу пытаемся отправить (expedited), не дожидаясь периодического окна.
     */
    fun maybeTriggerImmediateUpload(context: Context) {
        triggerImmediate(context)
    }
}
