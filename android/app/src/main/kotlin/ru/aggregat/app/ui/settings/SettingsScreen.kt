package ru.aggregat.app.ui.settings

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import ru.aggregat.app.service.AggregatNotificationListenerService
import ru.aggregat.app.ui.portal.PortalActivity

/**
 * Единственный экран приложения: настройка base URL сервера, регистрация устройства,
 * переход в системные настройки доступа к уведомлениям, статус подключения и
 * счётчик pending/sent уведомлений.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(viewModel: SettingsViewModel) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val listenerEnabled = remember(context) { isNotificationListenerEnabled(context) }

    val openPortal = {
        if (!viewModel.isDeviceRegistered()) {
            Toast.makeText(context, "Сначала зарегистрируйте устройство", Toast.LENGTH_SHORT).show()
        } else {
            // Открываем портал в WebView внутри приложения — активити сама прокидывает
            // авторизацию (base URL + токен) в localStorage сайта, вводить ничего не нужно.
            context.startActivity(Intent(context, PortalActivity::class.java))
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Aggregat") }) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            ServerConfigCard(
                state = state,
                onBaseUrlChanged = viewModel::onBaseUrlChanged,
                onPasswordChanged = viewModel::onPasswordChanged,
                onRegister = viewModel::registerDevice,
                onOpenPortal = openPortal,
            )
            NotificationAccessCard(listenerEnabled = listenerEnabled, context = context)
            BatteryOptimizationCard(context = context)
            StatusCard(state = state)
        }
    }
}

@Composable
private fun ServerConfigCard(
    state: SettingsUiState,
    onBaseUrlChanged: (String) -> Unit,
    onPasswordChanged: (String) -> Unit,
    onRegister: () -> Unit,
    onOpenPortal: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Адрес сервера", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = state.baseUrlInput,
                onValueChange = onBaseUrlChanged,
                label = { Text("https://your-server.example.com") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.passwordInput,
                onValueChange = onPasswordChanged,
                label = { Text("Пароль доступа") },
                singleLine = true,
                visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
            )

            when (state.registrationState) {
                RegistrationState.REGISTERING -> {
                    CircularProgressIndicator(modifier = Modifier.padding(top = 8.dp))
                }
                RegistrationState.REGISTERED -> {
                    Text(
                        "Устройство зарегистрировано",
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                RegistrationState.ERROR -> {
                    Text(
                        state.errorMessage ?: "Ошибка регистрации",
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                else -> {
                    state.errorMessage?.let {
                        Text(it, color = MaterialTheme.colorScheme.error)
                    }
                }
            }

            Button(onClick = onRegister, modifier = Modifier.fillMaxWidth()) {
                Text(if (state.registrationState == RegistrationState.REGISTERED) "Перерегистрировать" else "Зарегистрировать устройство")
            }

            // Открывает веб-дашборд в браузере уже с токеном (передаётся во фрагменте URL),
            // так что вручную адрес и токен на сайте вводить не нужно.
            if (state.registrationState == RegistrationState.REGISTERED) {
                OutlinedButton(onClick = onOpenPortal, modifier = Modifier.fillMaxWidth()) {
                    Text("Открыть портал")
                }
            }
        }
    }
}

/**
 * Карточка энергосбережения: показывает, исключено ли приложение из оптимизации
 * батареи, и даёт запросить исключение. Без этого агрессивные прошивки могут
 * усыплять/убивать процесс и слушателя, задерживая или пропуская уведомления.
 */
@Composable
private fun BatteryOptimizationCard(context: Context) {
    val powerManager = remember(context) { context.getSystemService(Context.POWER_SERVICE) as PowerManager }
    val ignoring = remember(context) { powerManager.isIgnoringBatteryOptimizations(context.packageName) }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Энергосбережение", style = MaterialTheme.typography.titleMedium)
            Text(
                if (ignoring) {
                    "Приложение исключено из оптимизации батареи — доставка не тормозится."
                } else {
                    "Приложение под оптимизацией батареи — система может задерживать отправку."
                },
                color = if (ignoring) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            )
            if (!ignoring) {
                OutlinedButton(
                    onClick = {
                        val intent = Intent(
                            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:${context.packageName}"),
                        )
                        try {
                            context.startActivity(intent)
                        } catch (e: Exception) {
                            // На некоторых прошивках прямой интент недоступен — открываем общий экран.
                            context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Отключить оптимизацию батареи")
                }
            }
        }
    }
}

@Composable
private fun NotificationAccessCard(listenerEnabled: Boolean, context: Context) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Доступ к уведомлениям", style = MaterialTheme.typography.titleMedium)
            Text(
                if (listenerEnabled) "Доступ предоставлен" else "Доступ НЕ предоставлен — приложение не сможет читать уведомления",
                color = if (listenerEnabled) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.error
                },
            )
            OutlinedButton(
                onClick = { context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Открыть настройки доступа к уведомлениям")
            }
        }
    }
}

@Composable
private fun StatusCard(state: SettingsUiState) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text("Очередь отправки", style = MaterialTheme.typography.titleMedium)
            Text("Ожидают отправки: ${state.pendingCount}")
            Text("Отправлено: ${state.sentCount}")
        }
    }
}

/**
 * Проверка через системный секьюр-сеттинг enabled_notification_listeners —
 * официальный способ узнать, включён ли доступ для конкретного слушателя,
 * без необходимости хранить собственное состояние.
 */
private fun isNotificationListenerEnabled(context: Context): Boolean {
    val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
        ?: return false
    val expectedComponent = "${context.packageName}/${AggregatNotificationListenerService::class.java.name}"
    return flat.split(":").any { it == expectedComponent }
}
