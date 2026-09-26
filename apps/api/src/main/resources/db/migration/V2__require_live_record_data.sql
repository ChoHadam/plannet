-- SQL CHECK treats NULL as passing. Make the live-record/non-null invariant explicit.
ALTER TABLE planner_record ADD CONSTRAINT planner_record_payload_presence
    CHECK (deleted = (data IS NULL));
