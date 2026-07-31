ALTER TABLE "CaptureAttempt"
  DROP CONSTRAINT "CaptureAttempt_preparation_check";

ALTER TABLE "CaptureAttempt"
  ADD CONSTRAINT "CaptureAttempt_preparation_check"
  CHECK ("preparation" IN ('none', 'partial', 'complete', 'precision_catalyst'));
