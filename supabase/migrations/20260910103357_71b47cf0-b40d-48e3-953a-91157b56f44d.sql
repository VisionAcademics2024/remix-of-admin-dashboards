alter table charges drop constraint if exists charge_one_source;

alter table charges add constraint charge_one_source check (
     (source = 'hours'  and package_id is not null and attendance_id is null)
  or (source = 'payg'   and attendance_id is not null and package_id is null)
  or (source = 'manual' and package_id is null      and attendance_id is null)
);