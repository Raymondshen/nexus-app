-- Add blur_in to the allowed text_effect set
alter table squad_definitions drop constraint squad_definitions_text_effect_check;
alter table squad_definitions add constraint squad_definitions_text_effect_check
  check (text_effect is null or text_effect = any (array['bouncy_text'::text, 'show_up'::text, 'particles'::text, 'blur_in'::text]));
