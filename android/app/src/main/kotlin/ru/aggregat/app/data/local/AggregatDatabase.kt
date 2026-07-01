package ru.aggregat.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(
    entities = [PendingNotification::class],
    version = 1,
    exportSchema = false,
)
@TypeConverters(Converters::class)
abstract class AggregatDatabase : RoomDatabase() {

    abstract fun pendingNotificationDao(): PendingNotificationDao

    companion object {
        private const val DB_NAME = "aggregat.db"

        @Volatile
        private var instance: AggregatDatabase? = null

        fun getInstance(context: Context): AggregatDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AggregatDatabase::class.java,
                    DB_NAME,
                ).build().also { instance = it }
            }
    }
}
