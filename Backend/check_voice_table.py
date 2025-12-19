from database import get_db_connection

conn = get_db_connection()
with conn.cursor() as cur:
    cur.execute('SHOW TABLES LIKE "voice_sessions"')
    result = cur.fetchone()
    if result:
        print('[SUCCESS] voice_sessions table exists!')
        cur.execute('DESCRIBE voice_sessions')
        desc = cur.fetchall()
        for col in desc:
            print(f'  - {col}')
    else:
        print('[ERROR] voice_sessions table does NOT exist!')
        print('Creating table now...')
        sql = r"""
        CREATE TABLE IF NOT EXISTS `voice_sessions` (
          `id` INT AUTO_INCREMENT PRIMARY KEY,
          `channel_id` INT NOT NULL,
          `user_id` INT NOT NULL,
          `is_muted` BOOLEAN DEFAULT FALSE,
          `is_deaf` BOOLEAN DEFAULT FALSE,
          `joined_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          `last_activity` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON DELETE CASCADE,
          FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
          UNIQUE KEY `unique_voice_session` (`channel_id`, `user_id`),
          INDEX `idx_channel_id` (`channel_id`),
          INDEX `idx_user_id` (`user_id`),
          INDEX `idx_joined_at` (`joined_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        """
        cur.execute(sql)
        conn.commit()
        print('[SUCCESS] Table created!')
conn.close()
