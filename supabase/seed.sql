-- ═══════════════════════════════════════════════════════════════════
-- MyApartment Intercom — Seed Data (200 Flats)
-- Run AFTER schema.sql and rls.sql
-- ═══════════════════════════════════════════════════════════════════

-- Sample resident names (rotated across 200 flats)
-- In production, admin updates these via the Admin Panel

insert into public.flats (id, block, floor, unit, resident_name) values
('A-101','A',1,1,'Sharma Family'),('A-102','A',1,2,'Verma Family'),('A-103','A',1,3,'Patel Family'),('A-104','A',1,4,'Gupta Family'),('A-105','A',1,5,'Singh Family'),
('A-201','A',2,1,'Kumar Family'),('A-202','A',2,2,'Mehta Family'),('A-203','A',2,3,'Joshi Family'),('A-204','A',2,4,'Shah Family'),('A-205','A',2,5,'Reddy Family'),
('A-301','A',3,1,'Nair Family'),('A-302','A',3,2,'Rao Family'),('A-303','A',3,3,'Pillai Family'),('A-304','A',3,4,'Iyer Family'),('A-305','A',3,5,'Menon Family'),
('A-401','A',4,1,'Das Family'),('A-402','A',4,2,'Bose Family'),('A-403','A',4,3,'Chatterjee Family'),('A-404','A',4,4,'Roy Family'),('A-405','A',4,5,'Sen Family'),
('A-501','A',5,1,'Mishra Family'),('A-502','A',5,2,'Tiwari Family'),('A-503','A',5,3,'Pandey Family'),('A-504','A',5,4,'Shukla Family'),('A-505','A',5,5,'Dubey Family'),
('A-601','A',6,1,'Srivastava Family'),('A-602','A',6,2,'Yadav Family'),('A-603','A',6,3,'Agarwal Family'),('A-604','A',6,4,'Garg Family'),('A-605','A',6,5,'Bansal Family'),
('A-701','A',7,1,'Malhotra Family'),('A-702','A',7,2,'Kapoor Family'),('A-703','A',7,3,'Khanna Family'),('A-704','A',7,4,'Chopra Family'),('A-705','A',7,5,'Bhatia Family'),
('A-801','A',8,1,'Arora Family'),('A-802','A',8,2,'Sethi Family'),('A-803','A',8,3,'Grover Family'),('A-804','A',8,4,'Bajaj Family'),('A-805','A',8,5,'Mehra Family'),
('A-901','A',9,1,'Anand Family'),('A-902','A',9,2,'Saxena Family'),('A-903','A',9,3,'Mathur Family'),('A-904','A',9,4,'Chauhan Family'),('A-905','A',9,5,'Rawat Family'),
('A-1001','A',10,1,'Jain Family'),('A-1002','A',10,2,'Khatri Family'),('A-1003','A',10,3,'Lal Family'),('A-1004','A',10,4,'Chandra Family'),('A-1005','A',10,5,'Dixit Family'),
('B-101','B',1,1,'Bhatt Family'),('B-102','B',1,2,'Trivedi Family'),('B-103','B',1,3,'Deshpande Family'),('B-104','B',1,4,'Patil Family'),('B-105','B',1,5,'Kulkarni Family'),
('B-201','B',2,1,'Jha Family'),('B-202','B',2,2,'Thakur Family'),('B-203','B',2,3,'Chaudhary Family'),('B-204','B',2,4,'Rana Family'),('B-205','B',2,5,'Gill Family'),
('B-301','B',3,1,'Ahuja Family'),('B-302','B',3,2,'Soni Family'),('B-303','B',3,3,'Taneja Family'),('B-304','B',3,4,'Walia Family'),('B-305','B',3,5,'Dhawan Family'),
('B-401','B',4,1,'Mitra Family'),('B-402','B',4,2,'Ghosh Family'),('B-403','B',4,3,'Mukherjee Family'),('B-404','B',4,4,'Banerjee Family'),('B-405','B',4,5,'Dutta Family'),
('B-501','B',5,1,'Chakraborty Family'),('B-502','B',5,2,'Biswas Family'),('B-503','B',5,3,'Mondal Family'),('B-504','B',5,4,'Basu Family'),('B-505','B',5,5,'Ganguly Family'),
('B-601','B',6,1,'Paul Family'),('B-602','B',6,2,'Sarkar Family'),('B-603','B',6,3,'Mazumdar Family'),('B-604','B',6,4,'Saha Family'),('B-605','B',6,5,'Chosh Family'),
('B-701','B',7,1,'Rajan Family'),('B-702','B',7,2,'Krishnan Family'),('B-703','B',7,3,'Subramaniam Family'),('B-704','B',7,4,'Venkatesh Family'),('B-705','B',7,5,'Balaji Family'),
('B-801','B',8,1,'Sundaram Family'),('B-802','B',8,2,'Natarajan Family'),('B-803','B',8,3,'Murugan Family'),('B-804','B',8,4,'Annamalai Family'),('B-805','B',8,5,'Selvam Family'),
('B-901','B',9,1,'Ramesh Family'),('B-902','B',9,2,'Suresh Family'),('B-903','B',9,3,'Ganesh Family'),('B-904','B',9,4,'Mahesh Family'),('B-905','B',9,5,'Naresh Family'),
('B-1001','B',10,1,'Balan Family'),('B-1002','B',10,2,'Mohan Family'),('B-1003','B',10,3,'Gopal Family'),('B-1004','B',10,4,'Raman Family'),('B-1005','B',10,5,'Srinivas Family'),
('C-101','C',1,1,'Desai Family'),('C-102','C',1,2,'Modi Family'),('C-103','C',1,3,'Mehta Family'),('C-104','C',1,4,'Thakkar Family'),('C-105','C',1,5,'Vora Family'),
('C-201','C',2,1,'Parekh Family'),('C-202','C',2,2,'Bhavsar Family'),('C-203','C',2,3,'Dalal Family'),('C-204','C',2,4,'Contractor Family'),('C-205','C',2,5,'Engineer Family'),
('C-301','C',3,1,'Sheth Family'),('C-302','C',3,2,'Savla Family'),('C-303','C',3,3,'Kapadia Family'),('C-304','C',3,4,'Dedhia Family'),('C-305','C',3,5,'Sanghvi Family'),
('C-401','C',4,1,'Choksi Family'),('C-402','C',4,2,'Jhaveri Family'),('C-403','C',4,3,'Khatri Family'),('C-404','C',4,4,'Punjabi Family'),('C-405','C',4,5,'Sindhi Family'),
('C-501','C',5,1,'Kohli Family'),('C-502','C',5,2,'Tandon Family'),('C-503','C',5,3,'Bahl Family'),('C-504','C',5,4,'Narang Family'),('C-505','C',5,5,'Sood Family'),
('C-601','C',6,1,'Sabharwal Family'),('C-602','C',6,2,'Gulati Family'),('C-603','C',6,3,'Chhabra Family'),('C-604','C',6,4,'Kochhar Family'),('C-605','C',6,5,'Sehgal Family'),
('C-701','C',7,1,'Madan Family'),('C-702','C',7,2,'Wadhwa Family'),('C-703','C',7,3,'Talwar Family'),('C-704','C',7,4,'Batra Family'),('C-705','C',7,5,'Uppal Family'),
('C-801','C',8,1,'Chandhok Family'),('C-802','C',8,2,'Bindra Family'),('C-803','C',8,3,'Kalra Family'),('C-804','C',8,4,'Behl Family'),('C-805','C',8,5,'Aneja Family'),
('C-901','C',9,1,'Dang Family'),('C-902','C',9,2,'Rathi Family'),('C-903','C',9,3,'Oswal Family'),('C-904','C',9,4,'Agrawal Family'),('C-905','C',9,5,'Kedia Family'),
('C-1001','C',10,1,'Murarka Family'),('C-1002','C',10,2,'Bagri Family'),('C-1003','C',10,3,'Sureka Family'),('C-1004','C',10,4,'Dalmia Family'),('C-1005','C',10,5,'Birla Family'),
('D-101','D',1,1,'Nanda Family'),('D-102','D',1,2,'Khosla Family'),('D-103','D',1,3,'Bedi Family'),('D-104','D',1,4,'Setia Family'),('D-105','D',1,5,'Sarin Family'),
('D-201','D',2,1,'Mehra Family'),('D-202','D',2,2,'Bakshi Family'),('D-203','D',2,3,'Bhasin Family'),('D-204','D',2,4,'Thapar Family'),('D-205','D',2,5,'Lamba Family'),
('D-301','D',3,1,'Popli Family'),('D-302','D',3,2,'Bajwa Family'),('D-303','D',3,3,'Cheema Family'),('D-304','D',3,4,'Sodhi Family'),('D-305','D',3,5,'Sandhu Family'),
('D-401','D',4,1,'Grewal Family'),('D-402','D',4,2,'Dhaliwal Family'),('D-403','D',4,3,'Sidhu Family'),('D-404','D',4,4,'Johal Family'),('D-405','D',4,5,'Virk Family'),
('D-501','D',5,1,'Sekhon Family'),('D-502','D',5,2,'Boparai Family'),('D-503','D',5,3,'Dhindsa Family'),('D-504','D',5,4,'Sangha Family'),('D-505','D',5,5,'Brar Family'),
('D-601','D',6,1,'Aulakh Family'),('D-602','D',6,2,'Hundal Family'),('D-603','D',6,3,'Kang Family'),('D-604','D',6,4,'Hayer Family'),('D-605','D',6,5,'Maan Family'),
('D-701','D',7,1,'Chadha Family'),('D-702','D',7,2,'Anand Family'),('D-703','D',7,3,'Bhandari Family'),('D-704','D',7,4,'Dhir Family'),('D-705','D',7,5,'Vij Family'),
('D-801','D',8,1,'Raina Family'),('D-802','D',8,2,'Tickoo Family'),('D-803','D',8,3,'Kaul Family'),('D-804','D',8,4,'Dhar Family'),('D-805','D',8,5,'Hangloo Family'),
('D-901','D',9,1,'Zutshi Family'),('D-902','D',9,2,'Matoo Family'),('D-903','D',9,3,'Pandita Family'),('D-904','D',9,4,'Sapru Family'),('D-905','D',9,5,'Wakhlu Family'),
('D-1001','D',10,1,'Koul Family'),('D-1002','D',10,2,'Ganjoo Family'),('D-1003','D',10,3,'Raina Family'),('D-1004','D',10,4,'Bhat Family'),('D-1005','D',10,5,'Razdan Family')
on conflict (id) do nothing;

-- ── HOW TO CREATE USERS ───────────────────────────────────────────────
-- After running this SQL, create users via Supabase Auth Dashboard or API:
--
-- 1. Admin:  admin@myapartment.com  | set strong password | role = 'admin'
-- 2. Guard:  guard@myapartment.com  | set strong password | role = 'guard'
-- 3. Residents: resident@flat.com  | role = 'resident' | flat_id = 'A-101'
--
-- Then update their profile rows:
-- UPDATE public.profiles SET role = 'admin', name = 'Society Admin' WHERE id = '<user-uuid>';
-- UPDATE public.profiles SET role = 'guard', name = 'Gate Security' WHERE id = '<user-uuid>';
-- UPDATE public.profiles SET role = 'resident', name = 'Sharma Family', flat_id = 'A-101' WHERE id = '<user-uuid>';


-- ══════════════════════════════════════════════════════════════════════
-- USER CREATION GUIDE (new flat-number login system)
-- ══════════════════════════════════════════════════════════════════════
--
-- Email format used internally (user never sees this):
--   Guard  → guard@myapartment.local
--   Admin  → admin@myapartment.local
--   Flat A-101 resident → flat-a-101@myapartment.local
--   Flat B-203 resident → flat-b-203@myapartment.local
--
-- STEP 1: Create users in Supabase Auth → Users → Add User
--   Use the internal email above + any PIN (minimum 4 digits) as password
--   Example:
--     Email: guard@myapartment.local    Password: 1234
--     Email: admin@myapartment.local    Password: 5678
--     Email: flat-a-101@myapartment.local  Password: 4321
--
-- STEP 2: After creating each user, run this SQL with their UUID:
--
-- Guard:
-- UPDATE public.profiles SET role='guard', name='Gate Security' WHERE id='GUARD-UUID';
--
-- Admin:
-- UPDATE public.profiles SET role='admin', name='RWA Admin' WHERE id='ADMIN-UUID';
--
-- Resident (flat A-101):
-- UPDATE public.profiles SET role='resident', name='Sharma Family', flat_id='A-101' WHERE id='RESIDENT-UUID';
--
-- ═══ BULK CREATE RESIDENTS (example for Block A) ═════════════════════
-- Repeat pattern for each flat you want to onboard.
-- The resident logs in with: Flat Number = A-101, PIN = 1234 (or whatever you set)
