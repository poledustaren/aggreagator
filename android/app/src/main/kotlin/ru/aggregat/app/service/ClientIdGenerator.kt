package ru.aggregat.app.service

import java.security.MessageDigest

/**
 * Генерация стабильного client_id для уведомления — ключ идемпотентности на сервере.
 *
 * Источник стабильности: sbn.key (уникален для конкретного StatusBarNotification в рамках
 * системы — включает пакет, id, tag, user) + время публикации (postTime). Этого достаточно,
 * чтобы:
 *  - повторный onNotificationPosted для ТОГО ЖЕ уведомления (например, апдейт прогресса
 *    загрузки) с тем же postTime не создавал дубликат при повторной обработке;
 *  - два РАЗНЫХ уведомления с одинаковым key, но разным postTime (что бывает при
 *    переиспользовании id уведомления приложением) считались разными событиями.
 *
 * key + postTime хэшируются SHA-256 и берутся в hex — компактно, детерминированно,
 * не зависит от чувствительного содержимого (title/text не участвуют, чтобы редактирование
 * текста уведомления с тем же key/postTime не плодило дубликаты).
 */
object ClientIdGenerator {

    fun generate(sbnKey: String, postTime: Long): String {
        val raw = "$sbnKey|$postTime"
        val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8))
        return digest.joinToString(separator = "") { "%02x".format(it) }
    }
}
