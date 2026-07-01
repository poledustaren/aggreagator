package ru.aggregat.app.data.local

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Хранилище настроек устройства: base URL сервера, device_id и bearer-токен.
 *
 * Токен и device_id — чувствительные данные (по сути пароль от аккаунта устройства
 * на self-host сервере), поэтому используем EncryptedSharedPreferences (AES256-GCM,
 * ключ в Android Keystore) вместо обычных SharedPreferences.
 */
class DeviceSettingsStore(context: Context) {

    private val prefs by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private val _baseUrl = MutableStateFlow<String?>(null)
    val baseUrl: StateFlow<String?> = _baseUrl.asStateFlow()

    private val _deviceToken = MutableStateFlow<String?>(null)
    val deviceToken: StateFlow<String?> = _deviceToken.asStateFlow()

    private val _deviceId = MutableStateFlow<String?>(null)
    val deviceId: StateFlow<String?> = _deviceId.asStateFlow()

    init {
        _baseUrl.value = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL)
        _deviceToken.value = prefs.getString(KEY_DEVICE_TOKEN, null)
        _deviceId.value = prefs.getString(KEY_DEVICE_ID, null)
    }

    fun getBaseUrl(): String? = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL)

    fun setBaseUrl(url: String) {
        prefs.edit().putString(KEY_BASE_URL, url).apply()
        _baseUrl.value = url
    }

    /**
     * URL веб-дашборда (портала) для WebView. Если явно не задан — берём тот же
     * origin, что и API (типовой self-host: SPA и /v1 за одним reverse-proxy, напр.
     * https://agg.dustar.pro/). Пользователь может переопределить (напр. если сайт
     * на отдельном порту 8081).
     */
    fun getPortalUrl(): String {
        prefs.getString(KEY_PORTAL_URL, null)?.let { if (it.isNotBlank()) return it }
        val base = getBaseUrl().orEmpty()
        return try {
            val uri = java.net.URI(base.trim())
            val scheme = uri.scheme
            val authority = uri.authority
            if (scheme != null && authority != null) "$scheme://$authority/" else base
        } catch (e: Exception) {
            base
        }
    }

    fun setPortalUrl(url: String) {
        prefs.edit().putString(KEY_PORTAL_URL, url).apply()
    }

    fun getDeviceToken(): String? = prefs.getString(KEY_DEVICE_TOKEN, null)

    fun getDeviceId(): String? = prefs.getString(KEY_DEVICE_ID, null)

    fun saveRegistration(deviceId: String, token: String) {
        prefs.edit()
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_DEVICE_TOKEN, token)
            .apply()
        _deviceId.value = deviceId
        _deviceToken.value = token
    }

    /** Сброс регистрации — используется при 401 от сервера (невалидный токен). */
    fun clearRegistration() {
        prefs.edit()
            .remove(KEY_DEVICE_ID)
            .remove(KEY_DEVICE_TOKEN)
            .apply()
        _deviceId.value = null
        _deviceToken.value = null
    }

    fun isRegistered(): Boolean = !getDeviceToken().isNullOrBlank()

    companion object {
        private const val PREFS_FILE_NAME = "aggregat_secure_prefs"
        private const val KEY_BASE_URL = "base_url"
        // Адрес сервера по умолчанию — прод на dustar.pro (США), за nginx+TLS.
        // Клиент сам добавляет "v1/". Регистрация устройства открыта, данные API — по
        // device-токену. Пользователь может изменить в настройках (напр. локальный http).
        const val DEFAULT_BASE_URL = "https://agg.dustar.pro/"
        private const val KEY_PORTAL_URL = "portal_url"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_DEVICE_ID = "device_id"
    }
}
