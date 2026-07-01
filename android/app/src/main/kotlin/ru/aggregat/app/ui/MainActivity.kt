package ru.aggregat.app.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
import ru.aggregat.app.AggregatApp
import ru.aggregat.app.ui.settings.SettingsScreen
import ru.aggregat.app.ui.settings.SettingsViewModel
import ru.aggregat.app.ui.theme.AggregatTheme

class MainActivity : ComponentActivity() {

    private val viewModel: SettingsViewModel by viewModels {
        object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
                val app = application as AggregatApp
                @Suppress("UNCHECKED_CAST")
                return SettingsViewModel(app.repository, app.settingsStore) as T
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AggregatTheme {
                SettingsScreen(viewModel = viewModel)
            }
        }
    }
}
