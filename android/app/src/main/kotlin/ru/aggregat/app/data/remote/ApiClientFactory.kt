package ru.aggregat.app.data.remote

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import ru.aggregat.app.BuildConfig
import ru.aggregat.app.data.local.DeviceSettingsStore
import java.util.concurrent.TimeUnit

/**
 * Фабрика Retrofit-клиента. Пересоздаётся при смене base URL (пользователь может
 * поменять адрес сервера в настройках в любой момент), поэтому не синглтон,
 * а функция создания — вызывающая сторона (репозиторий) кэширует результат
 * и инвалидирует при изменении baseUrl.
 */
object ApiClientFactory {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun create(baseUrl: String, settingsStore: DeviceSettingsStore): AggregatApi {
        val normalizedBaseUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

        val authInterceptor = okhttp3.Interceptor { chain ->
            val token = settingsStore.getDeviceToken()
            val request = if (!token.isNullOrBlank()) {
                chain.request().newBuilder()
                    .addHeader("Authorization", "Bearer $token")
                    .build()
            } else {
                chain.request()
            }
            chain.proceed(request)
        }

        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

        val okHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor)
            .addInterceptor(loggingInterceptor)
            .build()

        val contentType = "application/json".toMediaType()

        val retrofit = Retrofit.Builder()
            .baseUrl(normalizedBaseUrl)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()

        return retrofit.create(AggregatApi::class.java)
    }
}
