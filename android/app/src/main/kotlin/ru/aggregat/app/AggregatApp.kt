package ru.aggregat.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import ru.aggregat.app.data.local.AggregatDatabase
import ru.aggregat.app.data.local.DeviceSettingsStore
import ru.aggregat.app.data.repository.NotificationRepository
import ru.aggregat.app.work.UploadScheduler
import ru.aggregat.app.work.UploadWorker

/**
 * Application-класс — точка сборки зависимостей (ручной DI / Service Locator).
 *
 * Решение по DI: ручная сборка вместо Hilt/Koin. Проект небольшой, слоёв немного
 * (Room + Retrofit + один Service + один Worker + один экран), граф зависимостей
 * плоский. Hilt добавил бы codegen, KAPT/KSP-конфигурацию и boilerplate ради
 * DI-контейнера, который здесь можно выразить тремя полями в Application.
 * Это тот же принцип KISS/минимализм, что и в других личных Android-проектах:
 * ручной DI до тех пор, пока граф зависимостей не станет действительно сложным.
 */
class AggregatApp : Application() {

    lateinit var database: AggregatDatabase
        private set

    lateinit var settingsStore: DeviceSettingsStore
        private set

    lateinit var repository: NotificationRepository
        private set

    override fun onCreate() {
        super.onCreate()

        database = AggregatDatabase.getInstance(this)
        settingsStore = DeviceSettingsStore(this)
        repository = NotificationRepository(database, settingsStore)

        createUploadChannel()

        // Периодическая задача регистрируется один раз при старте процесса;
        // enqueueUniquePeriodicWork с KEEP не создаёт дублей при повторных запусках.
        UploadScheduler.schedulePeriodic(this)
    }

    /**
     * Канал для служебного уведомления expedited-отправки. Нужен на Android < 12,
     * где expedited-Worker выполняется как foreground service и обязан показать
     * уведомление (см. UploadWorker.getForegroundInfo). Держим канал минимально
     * заметным (IMPORTANCE_LOW — без звука).
     */
    private fun createUploadChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            UploadWorker.UPLOAD_CHANNEL_ID,
            "Отправка уведомлений",
            NotificationManager.IMPORTANCE_LOW,
        ).apply { description = "Фоновая выгрузка уведомлений на сервер Aggregat" }
        manager.createNotificationChannel(channel)
    }
}
