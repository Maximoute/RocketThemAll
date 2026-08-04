-- Boss support items are contributions for participation and history, but they do
-- not directly add objective progress. Their amount is therefore legitimately 0.
ALTER TABLE "BossContribution"
  DROP CONSTRAINT "BossContribution_amount_check";

ALTER TABLE "BossContribution"
  ADD CONSTRAINT "BossContribution_amount_check" CHECK ("amount" >= 0);
