package ru.aggregat.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface PendingNotificationDao {

    /**
     * IGNORE при конфликте уникального индекса clientId — если такое уведомление
     * уже есть локально (в любом статусе), новую вставку просто отбрасываем.
     */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(notification: PendingNotification): Long

    @Query("SELECT * FROM pending_notification WHERE status = :status ORDER BY createdAtEpochMillis ASC LIMIT :limit")
    suspend fun getBatch(status: SendStatus = SendStatus.PENDING, limit: Int = 100): List<PendingNotification>

    @Query("UPDATE pending_notification SET status = :status WHERE id IN (:ids)")
    suspend fun updateStatus(ids: List<Long>, status: SendStatus)

    @Query("SELECT COUNT(*) FROM pending_notification WHERE status = :status")
    suspend fun countByStatus(status: SendStatus): Int

    @Query("SELECT COUNT(*) FROM pending_notification WHERE status = 'PENDING'")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM pending_notification WHERE status = 'SENT'")
    fun observeSentCount(): Flow<Int>

    /** Периодическая чистка старых отправленных записей, чтобы БД не росла бесконечно. */
    @Query("DELETE FROM pending_notification WHERE status = 'SENT' AND createdAtEpochMillis < :beforeEpochMillis")
    suspend fun deleteSentOlderThan(beforeEpochMillis: Long): Int
}
