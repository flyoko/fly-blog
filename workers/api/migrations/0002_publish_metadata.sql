ALTER TABLE publish_runs ADD COLUMN resource_path TEXT;
ALTER TABLE publish_runs ADD COLUMN pull_request_url TEXT;

CREATE INDEX idx_publish_runs_pull_number ON publish_runs(pull_number);
CREATE INDEX idx_publish_runs_status ON publish_runs(status);
