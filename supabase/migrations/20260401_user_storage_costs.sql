-- RPC function to calculate per-user storage costs
-- Returns storage bytes (from trade-screenshots bucket) and DB bytes (from image_attachments JSONB)

CREATE OR REPLACE FUNCTION get_user_storage_costs()
RETURNS TABLE(user_id uuid, storage_bytes bigint, db_bytes bigint)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(s.uid, d.user_id) AS user_id,
    COALESCE(s.storage_bytes, 0)::bigint AS storage_bytes,
    COALESCE(d.db_bytes, 0)::bigint AS db_bytes
  FROM (
    SELECT
      (split_part(name, '/', 1))::uuid AS uid,
      SUM((metadata->>'size')::bigint) AS storage_bytes
    FROM storage.objects
    WHERE bucket_id = 'trade-screenshots'
    GROUP BY split_part(name, '/', 1)
  ) s
  FULL OUTER JOIN (
    SELECT
      t.user_id,
      SUM(octet_length(t.image_attachments::text))::bigint AS db_bytes
    FROM trades t
    WHERE t.image_attachments != '[]'::jsonb
    GROUP BY t.user_id
  ) d ON s.uid = d.user_id;
$$;
