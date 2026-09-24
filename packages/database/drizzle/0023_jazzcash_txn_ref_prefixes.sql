-- Allow JazzCash-style T-prefixed txn refs (max 20 chars) alongside SkillUp SU refs.
alter table payment_orders
  drop constraint if exists payment_orders_merchant_reference_format;

alter table payment_orders
  add constraint payment_orders_merchant_reference_format check (
    merchant_reference ~ '^(SU[0-9]{14}[A-Z0-9]{4,8}|T[0-9]{14}[A-Z0-9]{0,4})$'
  );
