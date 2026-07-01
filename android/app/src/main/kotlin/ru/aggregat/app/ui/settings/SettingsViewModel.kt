package ru.aggregat.app.ui.settings

import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import ru.aggregat.app.data.local.DeviceSettingsStore
import ru.aggregat.app.data.repository.NotificationRepository
import ru.aggregat.app.data.repository.RegistrationResult

enum class RegistrationState {
    UNKNOWN,
    NOT_REGISTERED,
    REGISTERING,
    REGISTERED,
    ERROR,
}

data class SettingsUiState(
    val baseUrlInput: String = "",
    val registrationState: RegistrationState = RegistrationState.UNKNOWN,
    val errorMessage: String? = null,
    val pendingCount: Int = 0,
    val sentCount: Int = 0,
)

/**
 * ViewModel экрана настроек. Собирается вручную в MainActivity (ручной DI),
 * получает уже готовые repository/settingsStore из AggregatApp.
 */
class SettingsViewModel(
    private val repository: NotificationRepository,
    private val settingsStore: DeviceSettingsStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        SettingsUiState(
            baseUrlInput = settingsStore.getBaseUrl().orEmpty(),
            registrationState = if (settingsStore.isRegistered()) {
                RegistrationState.REGISTERED
            } else {
                RegistrationState.NOT_REGISTERED
            },
        ),
    )
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            combine(repository.pendingCount, repository.sentCount) { pending, sent -> pending to sent }
                .collect { (pending, sent) ->
                    _uiState.value = _uiState.value.copy(pendingCount = pending, sentCount = sent)
                }
        }
    }

    fun onBaseUrlChanged(value: String) {
        _uiState.value = _uiState.value.copy(baseUrlInput = value, errorMessage = null)
    }

    /**
     * Регистрирует устройство на сервере с введённым base URL. При успехе
     * сохраняет device_id/token и переводит состояние в REGISTERED.
     */
    fun registerDevice() {
        val url = _uiState.value.baseUrlInput.trim()
        if (url.isBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Укажите адрес сервера")
            return
        }

        _uiState.value = _uiState.value.copy(registrationState = RegistrationState.REGISTERING, errorMessage = null)

        viewModelScope.launch {
            val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".trim().ifBlank { "Android device" }
            when (val result = repository.registerDevice(url, deviceName)) {
                RegistrationResult.Success -> {
                    _uiState.value = _uiState.value.copy(
                        registrationState = RegistrationState.REGISTERED,
                        errorMessage = null,
                    )
                }
                RegistrationResult.NetworkError -> {
                    _uiState.value = _uiState.value.copy(
                        registrationState = RegistrationState.ERROR,
                        errorMessage = "Сервер недоступен. Проверьте адрес и сеть.",
                    )
                }
                is RegistrationResult.Failure -> {
                    _uiState.value = _uiState.value.copy(
                        registrationState = RegistrationState.ERROR,
                        errorMessage = "Ошибка регистрации (код ${result.code ?: "?"})",
                    )
                }
            }
        }
    }

    fun isDeviceRegistered(): Boolean = settingsStore.isRegistered()
}
