package ru.aggregat.app.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * DTO модели точно по контракту C:\Projects\aggregat\contracts\openapi.yaml.
 * Имена полей совпадают со схемой (snake_case), поэтому @SerialName не нужен
 * для большинства полей — kotlinx.serialization по умолчанию берёт имя свойства.
 */

@Serializable
data class DeviceRegisterRequest(
    val platform: String = "android",
    @SerialName("device_name") val deviceName: String,
    @SerialName("push_token") val pushToken: String? = null,
    // Пароль доступа (WEB_PASSWORD на сервере). Обязателен, если сервер его требует.
    val password: String? = null,
)

@Serializable
data class DeviceRegisterResponse(
    @SerialName("device_id") val deviceId: String,
    val token: String,
)

@Serializable
data class RawNotificationDto(
    @SerialName("client_id") val clientId: String,
    @SerialName("source_app") val sourceApp: String,
    @SerialName("app_label") val appLabel: String? = null,
    val title: String? = null,
    val text: String? = null,
    val subtext: String? = null,
    val category: String? = null,
    @SerialName("posted_at") val postedAt: String,
    val extras: JsonObject? = null,
)

@Serializable
data class IngestRequest(
    val notifications: List<RawNotificationDto>,
)

@Serializable
data class IngestResponse(
    val accepted: Int,
    val duplicates: Int,
)
