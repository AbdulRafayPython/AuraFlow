-- Profile banner (Discord-style): a picture, or a solid colour when there is no picture.
-- Additive and safe to run once on an existing database.
ALTER TABLE `users`
  ADD COLUMN `banner_url`   VARCHAR(500) NULL AFTER `avatar_url`,
  ADD COLUMN `banner_color` VARCHAR(7)   NULL AFTER `banner_url`;
