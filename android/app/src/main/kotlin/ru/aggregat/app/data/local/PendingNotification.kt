package ru.aggregat.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Статус локальной записи уведомления в очереди на отправку.
 */
enum class SendStatus {
    PENDING,
    SENT,
}

/**
 * Локальная запись пойманного уведомления.
 *
 * Пишется в БД СРАЗУ при перехвате (onNotificationPosted), до любой попытки
 * сетевой отправки — это гарантирует, что уведомление переживёт оффлайн-режим
 * и перезапуск процесса/устройства. Отправка — отдельный асинхронный шаг.
 *
 * Уникальный индекс по clientId — локальная дедупликация: одно и то же
 * системное уведомление (например, повторный onNotificationPosted при
 * обновлении текста) не должно создавать вторую запись.
 */
@Entity(
    tableName = "pending_notification",
    indices = [Index(value = ["clientId"], unique = true)],
)
data class PendingNotification(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val clientId: String,
    val sourceApp: String,
    val appLabel: String?,
    val title: String?,
    val text: String?,
    val subtext: String?,
    val category: String?,
    /** ISO-8601 с таймзоной, см. IsoTime.format(). */
    val postedAt: String,
    /** extras сериализован в JSON-строку (произвольный объект по контракту). */
    val extrasJson: String?,
    val status: SendStatus = SendStatus.PENDING,
    /** Локальная метка времени создания записи (epoch millis) — для сортировки/отладки. */
    val createdAtEpochMillis: Long = System.currentTimeMillis(),
)
