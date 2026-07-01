package ru.aggregat.app.data.remote

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Retrofit-интерфейс. Пути соответствуют openapi.yaml: /v1/devices:register и
 * /v1/notifications:ingest — двоеточие в пути валидно для HTTP, Retrofit его не экранирует.
 *
 * base URL, который вводит пользователь, должен указывать на корень сервера
 * (например, https://myserver.example.com/) — версия "v1/" добавлена здесь.
 */
interface AggregatApi {

    @POST("v1/devices:register")
    suspend fun registerDevice(@Body request: DeviceRegisterRequest): Response<DeviceRegisterResponse>

    @POST("v1/notifications:ingest")
    suspend fun ingestNotifications(@Body request: IngestRequest): Response<IngestResponse>
}
