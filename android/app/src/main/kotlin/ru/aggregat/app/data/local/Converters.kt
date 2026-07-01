package ru.aggregat.app.data.local

import androidx.room.TypeConverter

/**
 * Room-конвертер для enum SendStatus <-> String.
 * Явный конвертер вместо enum-колонки напрямую — предсказуемое хранение и миграции.
 */
class Converters {
    @TypeConverter
    fun fromSendStatus(value: SendStatus): String = value.name

    @TypeConverter
    fun toSendStatus(value: String): SendStatus = SendStatus.valueOf(value)
}
