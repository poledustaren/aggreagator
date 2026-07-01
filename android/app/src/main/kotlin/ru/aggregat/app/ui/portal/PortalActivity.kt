package ru.aggregat.app.ui.portal

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import org.json.JSONObject
import ru.aggregat.app.AggregatApp

/**
 * Портал: открывает веб-дашборд в WebView и САМ прокидывает авторизацию, чтобы
 * пользователю не вводить адрес сервера и токен на сайте вручную.
 *
 * Как: у приложения уже есть base URL API и device-токен (EncryptedSharedPreferences).
 * Сайт хранит настройки подключения в localStorage под ключом 'aggregat.settings.v1'
 * (см. web/src/api/settings.ts). Мы после загрузки страницы кладём туда
 * {baseUrl, token} и перезагружаем корень — гард настроек на сайте пропускает
 * сразу на дашборд.
 */
class PortalActivity : ComponentActivity() {

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val store = (application as AggregatApp).settingsStore
        val portalUrl = store.getPortalUrl()
        val apiBase = store.getBaseUrl().orEmpty()
        val token = store.getDeviceToken().orEmpty()

        // Тот же формат, что ConnectionSettings на сайте (web/src/api/settings.ts).
        val settingsJson = JSONObject()
            .put("baseUrl", apiBase)
            .put("token", token)
            .toString()

        val webView = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // localStorage для сайта
            webViewClient = object : WebViewClient() {
                private var injected = false

                override fun onPageFinished(view: WebView, url: String?) {
                    if (injected) return
                    injected = true
                    // JSONObject.quote → корректный JS-строковый литерал с экранированием.
                    val js = "localStorage.setItem('aggregat.settings.v1', " +
                        "${JSONObject.quote(settingsJson)}); location.replace('/');"
                    view.evaluateJavascript(js, null)
                }
            }
        }

        setContentView(webView)
        webView.loadUrl(portalUrl)

        // Аппаратная «Назад»: сначала по истории WebView, затем выход из активити.
        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) webView.goBack() else finish()
        }
    }
}
