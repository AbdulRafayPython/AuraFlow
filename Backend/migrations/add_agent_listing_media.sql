-- Agent marketplace listings get a face: a persona avatar (icon_url), a banner, a one-line
-- tagline and a longer overview, all chosen by the publisher. Images are either one of the
-- bundled gallery files (/agents/personas/*.webp, /agents/banners/*.webp) or an upload
-- (/uploads/agent-listings/...). Existing listings keep working with empty values.
--
-- Requires add_agent_listings.sql. Confirm the target database before applying.
ALTER TABLE `agent_listings`
  ADD COLUMN `tagline`    VARCHAR(80)  NOT NULL DEFAULT '' AFTER `description`,
  ADD COLUMN `overview`   TEXT         NULL AFTER `tagline`,
  ADD COLUMN `icon_url`   VARCHAR(500) NULL AFTER `overview`,
  ADD COLUMN `banner_url` VARCHAR(500) NULL AFTER `icon_url`;
