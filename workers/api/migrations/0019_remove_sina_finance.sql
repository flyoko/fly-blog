DELETE FROM finance_flash_exclusions
WHERE item_id IN (
  SELECT id FROM finance_flash_items WHERE source_id = 'sina-inews-7x24'
);

DELETE FROM finance_flash_items
WHERE source_id = 'sina-inews-7x24';

DELETE FROM finance_flash_sync_state
WHERE source_id = 'sina-inews-7x24';
