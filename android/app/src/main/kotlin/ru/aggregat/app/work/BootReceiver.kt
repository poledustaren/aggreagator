package ru.aggregat.app.work

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * После перезагрузки устройства заново регистрирует периодическую отправку.
 * WorkManager и сам восстанавливает свои задачи после ребута, но явное
 * переармирование — дешёвая страховка на случай, если процесс не поднимут иначе.
 * NotificationListenerService система перепривязывает автоматически.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.i("BootReceiver", "BOOT_COMPLETED — переармируем периодическую отправку")
            UploadScheduler.schedulePeriodic(context.applicationContext)
        }
    }
}
