-- Store detailer's vehicle (pro's car) separately so we keep customer's vehicle in car_name.
alter table public.detailer_bookings
  add column if not exists detailer_vehicle text;

comment on column public.detailer_bookings.detailer_vehicle is 'Detailer/pro vehicle (year make model) shown to customer when assigned. car_name remains the customer vehicle being serviced.';
