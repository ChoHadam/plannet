-- Commit receipts previously copied every acknowledged plan body. Keep request ids/hashes forever (delayed lost-ACK
-- retries must stay idempotent) but store only immutable record metadata. Replays rebuild data from the retried,
-- hash-identical request. Only records[].data is removed; order and all other fields are preserved.
UPDATE planner_commit_receipt
SET response = jsonb_build_object(
    'format', 2,
    'records', COALESCE((
        SELECT jsonb_agg(element - 'data' ORDER BY position)
        FROM jsonb_array_elements(response -> 'records') WITH ORDINALITY AS item(element, position)
    ), '[]'::jsonb))
WHERE NOT (response ? 'format');

ALTER TABLE planner_commit_receipt ADD CONSTRAINT planner_commit_receipt_metadata_only
    CHECK ((response -> 'format' = '2'::jsonb AND jsonb_typeof(response -> 'records') = 'array'
           AND NOT jsonb_path_exists(response, '$.records[*].data')) IS TRUE);
