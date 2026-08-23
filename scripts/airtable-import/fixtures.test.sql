-- Test fixtures for 02-transform.sql.
--
-- Synthetic records shaped exactly like the Jah Copy base, chosen to exercise
-- every path the transform has to get right: a shared guardian, a private class
-- with the wrong capacity, a draft enrolment, one package eligible across two
-- enrolments, a cancelled lesson with someone marked present on it, a trial, a
-- make-up with a source and one without, and a charge with no source at all.
--
-- No real people. Run after 01-staging.sql, then 02-transform.sql.
-- See README.md for the expected results.

begin;
truncate staging.at_guardians, staging.at_students, staging.at_tutors, staging.at_periods,
         staging.at_prices, staging.at_programs, staging.at_offerings, staging.at_billing,
         staging.at_hours, staging.at_sessions, staging.at_attendance, staging.at_charges,
         staging.at_payouts;

insert into staging.at_guardians values
 ('recG1','2026-07-01T00:00:00Z','{"Guardian Code":"GUA-0001","Full Name":"Andrew Oh","Email":"a@example.com","Mobile":"0400000001","Status":"Active"}'),
 ('recG2','2026-07-02T00:00:00Z','{"Guardian Code":"GUA-0002","Full Name":"Gaeul Park","Status":"Active"}');

-- Two siblings sharing one guardian; second student has two guardians.
insert into staging.at_students values
 ('recS1','2026-07-01T00:00:00Z','{"Student Code":"STU-0001","Student Name":"Christie Oh","Status":"Active","Year Level":"Year 5","Joined Date":"2026-07-01","Parents / Guardians":["recG1"],"Default Payer / Contact":["recG1"]}'),
 ('recS2','2026-07-02T00:00:00Z','{"Student Code":"STU-0002","Student Name":"Rohee Kim","Status":"Active","Parents / Guardians":["recG1","recG2"],"Default Payer / Contact":["recG2"]}');

insert into staging.at_tutors values
 ('recT1','2026-07-01T00:00:00Z','{"Tutor Code":"TUT-0001","Tutor Name":"Harrison Liu","Status":"Active","Hourly Rate":45}'),
 ('recT2','2026-07-02T00:00:00Z','{"Tutor Code":"TUT-0002","Tutor Name":"Justin Cho","Status":"Active","Hourly Rate":0}');

insert into staging.at_periods values
 ('recP1','2026-07-01T00:00:00Z','{"Period Name":"Term 3 2026","Period Code":"2026-T3","Period Type":"Standard Term","Start Date":"2026-07-14","End Date":"2026-09-19","Status":"Active"}');

-- A per-hour price (the trap) and a per-session one.
insert into staging.at_prices values
 ('recPR1','2026-07-01T00:00:00Z','{"Standard Price Name":"Y5 per hour","Standard Price Code":"Y5-HR","Pricing Basis":"Per Hour","Standard Hours / Sessions":1,"Standard Price / Unit Rate":80,"Effective From":"2026-01-01","Status":"Active"}'),
 ('recPR2','2026-07-02T00:00:00Z','{"Standard Price Name":"Group block","Standard Price Code":"GRP-10","Pricing Basis":"Per Session","Standard Hours / Sessions":10,"Standard Price / Unit Rate":55,"Effective From":"2026-01-01","Status":"Active"}');

insert into staging.at_programs values
 ('recPG1','2026-07-01T00:00:00Z','{"Program Name":"Year 5 Private","Program Code":"Y5-PRIV","Default Offering Type":"Private Tuition","Standard Duration":1.5,"Active":true,"Default Standard Price":["recPR1"]}'),
 ('recPG2','2026-07-02T00:00:00Z','{"Program Name":"Year 5 Group","Program Code":"Y5-GRP","Default Offering Type":"Group Class","Standard Duration":2,"Active":true}');

-- Old-format code, and a private offering whose Capacity is wrong (must force 1).
insert into staging.at_offerings values
 ('recO1','2026-07-29T10:00:00Z','{"Offering Code":"OFF-2026T3-Y5-PRI-GEN-01","Program":["recPG1"],"Operating Period":["recP1"],"Offering Type":"Private Tuition","Primary Tutor":["recT1"],"Capacity":6,"Start Date":"2026-07-14","End Date":"2026-09-19","Recurrence Pattern":"Weekly","Recurrence Start":"2026-07-15T07:30:00.000Z","Standard Session Duration":1.5,"Status":"Active","Room":"Room 1"}'),
 ('recO2','2026-08-07T09:00:00Z','{"Offering Code":"OFF-0021","Program":["recPG2"],"Operating Period":["recP1"],"Offering Type":"Group Class","Primary Tutor":["recT2"],"Capacity":8,"Start Date":"2026-07-14","End Date":"2026-09-19","Recurrence Pattern":"Weekly","Recurrence Start":"2026-07-16T06:00:00.000Z","Standard Session Duration":2,"Status":"Active"}');

-- One hours enrolment with an override, one PAYG, one Draft (must be excluded).
insert into staging.at_billing values
 ('recB1','2026-07-29T11:00:00Z','{"Billing Code":"BILL-0001","Student":["recS1"],"Class Offering":["recO1"],"Status":"Active","Start Date":"2026-07-14","Billing Method":"Hours","Standard Price":["recPR1"],"Base Price":800,"Adjustment Type":"None","Adjustment Value":0,"Hours Purchased Override":10,"Default Hours":["recH1"]}'),
 ('recB2','2026-07-29T11:01:00Z','{"Billing Code":"BILL-0002","Student":["recS1"],"Class Offering":["recO2"],"Status":"Active","Start Date":"2026-07-14","Billing Method":"Hours","Standard Price":["recPR2"],"Base Price":550,"Adjustment Type":"Percentage","Adjustment Value":-0.1,"Default Hours":["recH1"]}'),
 ('recB3','2026-07-29T11:02:00Z','{"Billing Code":"BILL-0003","Student":["recS2"],"Class Offering":["recO2"],"Status":"Active","Start Date":"2026-07-14","Billing Method":"PAYG","Standard Price":["recPR2"],"Base Price":55,"Adjustment Type":"None"}'),
 ('recB4','2026-07-29T11:03:00Z','{"Billing Code":"BILL-0004","Student":["recS2"],"Class Offering":["recO1"],"Status":"Draft","Start Date":"2026-08-01"}');

-- One package eligible on BOTH of recS1's enrolments — the sibling/two-class case.
insert into staging.at_hours values
 ('recH1','2026-07-29T11:42:00Z','{"Hours Code":"HRS-0001","Hours Type":"Purchased","Student":["recS1"],"Eligible Billing":["recB1","recB2"],"Standard Price Source":["recPR1"],"Approval Date":"2026-07-14","Hours Purchased":10,"Status":"Active","Final Hours Price":800,"Low Balance Threshold":2}'),
 ('recH2','2026-07-29T11:43:00Z','{"Hours Code":"HRS-0002","Hours Type":"Courtesy","Student":["recS2"],"Eligible Billing":["recB3"],"Approval Date":"2026-07-20","Hours Purchased":2,"Status":"Active","Courtesy Reason":"Goodwill after a cancelled term"}');

-- A normal lesson, a cancelled one, a rescheduled pair, and a pay adjustment.
insert into staging.at_sessions values
 ('recSE1','2026-08-04T09:00:00Z','{"Session Code":"SES-0001","Class Offering":["recO1"],"Tutor":["recT1"],"Session Type":"Regular","Status":"Completed","Scheduled Start":"2026-07-15T07:30:00.000Z","Scheduled End":"2026-07-15T09:00:00.000Z","Room":"Room 1"}'),
 ('recSE2','2026-08-04T09:01:00Z','{"Session Code":"SES-0002","Class Offering":["recO1"],"Tutor":["recT1"],"Session Type":"Regular","Status":"Cancelled - No Class","Scheduled Start":"2026-07-22T07:30:00.000Z","Scheduled End":"2026-07-22T09:00:00.000Z"}'),
 ('recSE3','2026-08-04T09:02:00Z','{"Session Code":"SES-0003","Class Offering":["recO1"],"Tutor":["recT1"],"Session Type":"Regular","Status":"Rescheduled","Scheduled Start":"2026-07-29T07:30:00.000Z","Scheduled End":"2026-07-29T09:00:00.000Z"}'),
 ('recSE4','2026-08-04T09:03:00Z','{"Session Code":"SES-0004","Class Offering":["recO1"],"Tutor":["recT1"],"Session Type":"Dedicated Make-up","Status":"Completed","Scheduled Start":"2026-07-31T07:30:00.000Z","Scheduled End":"2026-07-31T09:00:00.000Z","Replacement For":["recSE3"],"Pay Adjustment":25,"Pay Note":"Ran 30 minutes over at the parent request"}'),
 ('recSE5','2026-08-04T09:04:00Z','{"Session Code":"SES-0005","Class Offering":["recO2"],"Tutor":["recT2"],"Session Type":"Regular","Status":"Completed","Scheduled Start":"2026-07-16T06:00:00.000Z","Scheduled End":"2026-07-16T08:00:00.000Z"}'),
 ('recSE6','2026-08-04T09:05:00Z','{"Session Code":"SES-0006","Class Offering":["recO1"],"Tutor":["recT1"],"Session Type":"Regular","Status":"Scheduled","Scheduled End":"2026-08-05T09:00:00.000Z"}');

-- present / absent / make-up-with-source / make-up-WITHOUT-source / trial
insert into staging.at_attendance values
 ('recA1','2026-08-04T09:28:00Z','{"Attendance Code":"ATT-0001","Session":["recSE1"],"Billing":["recB1"],"Attendance Type":"Regular","Attendance Status":"Present","Hours":["recH1"]}'),
 ('recA2','2026-08-04T09:28:01Z','{"Attendance Code":"ATT-0002","Session":["recSE3"],"Billing":["recB1"],"Attendance Type":"Regular","Attendance Status":"Absent","Hours":["recH1"]}'),
 ('recA3','2026-08-04T09:28:02Z','{"Attendance Code":"ATT-0003","Session":["recSE4"],"Billing":["recB1"],"Attendance Type":"Make-up","Attendance Status":"Present","Hours":["recH1"],"Source Absence":["recA2"]}'),
 ('recA4','2026-08-04T09:28:03Z','{"Attendance Code":"ATT-0004","Session":["recSE2"],"Billing":["recB1"],"Attendance Type":"Regular","Attendance Status":"Present","Hours":["recH1"]}'),
 ('recA5','2026-08-04T09:28:04Z','{"Attendance Code":"ATT-0005","Session":["recSE5"],"Billing":["recB3"],"Attendance Type":"Trial","Attendance Status":"Present"}'),
 ('recA6','2026-08-04T09:28:05Z','{"Attendance Code":"ATT-0006","Session":["recSE5"],"Billing":["recB2"],"Attendance Type":"Make-up","Attendance Status":"Present","Hours":["recH1"]}');

-- One hours invoice, one PAYG charge, one broken charge (no source → skipped).
insert into staging.at_charges values
 ('recC1','2026-08-04T10:05:00Z','{"Charge Code":"CHG-2026-0001","Student":["recS1"],"Payer":["recG1"],"Source Type":"Hours","Hours":["recH1"],"Standard Amount":800,"Price Adjustment":-50,"Charge Route":"Parent","Charge Status":"Paid","Invoice Date":"2026-07-15","Paid Date":"2026-07-20","Payment Method":"Bank Transfer","Payment Reference":"INV-001","Xero Invoice Number":"INV-001"}'),
 ('recC2','2026-08-04T10:06:00Z','{"Charge Code":"CHG-2026-0002","Student":["recS2"],"Payer":["recG2"],"Source Type":"PAYG Attendance","Attendance":["recA5"],"Standard Amount":55,"Price Adjustment":0,"Charge Route":"Parent","Charge Status":"To Invoice"}'),
 ('recC3','2026-08-04T10:07:00Z','{"Charge Code":"CHG-2026-0003","Student":["recS2"],"Source Type":"Hours","Standard Amount":100,"Charge Route":"Internal Cash/Bank","Charge Status":"To Invoice"}');
commit;
