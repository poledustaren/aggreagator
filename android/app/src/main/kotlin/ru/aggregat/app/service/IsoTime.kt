package ru.aggregat.app.service

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Форматирование epoch millis в ISO-8601 с таймзоной (например, 2026-07-01T10:15:30.123+0300),
 * как требует контракт (posted_at: string, format date-time).
 *
 * minSdk=26 позволил бы использовать java.time напрямую, но SimpleDateFormat здесь
 * выбран как более простой и предсказуемый способ без лишних зависимостей — API
 * java.time.format для ISO с офсетом чуть многословнее для этой единственной задачи.
 */
object IsoTime {
    fun format(epochMillis: Long): String {
        val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US)
        formatter.timeZone = TimeZone.getDefault()
        return formatter.format(Date(epochMillis))
    }
}
