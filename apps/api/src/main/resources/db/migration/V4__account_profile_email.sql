-- Mutable profile metadata only: identity stays (provider, subject) -> id. Not unique, never a merge key.
-- Existing accounts stay NULL until a verified login supplies the address.
ALTER TABLE plannet_user ADD COLUMN email VARCHAR(320);

ALTER TABLE plannet_user ADD CONSTRAINT plannet_user_email_shape
    CHECK (email IS NULL OR email ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+$');
