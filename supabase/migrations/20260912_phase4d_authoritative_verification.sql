alter table public.competitive_sessions add column if not exists daily_date date;

create or replace function public.verify_competitive_session(
  p_session_id uuid,
  p_board text[],
  p_mistakes integer,
  p_hints_used integer,
  p_client_score integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.competitive_sessions%rowtype;
  final_score int;
  earned_xp int;
  elapsed int;
  r int;
  c int;
  br int;
  bc int;
  n int;
  seen boolean[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into s from public.competitive_sessions
    where id=p_session_id and user_id=auth.uid() for update;
  if not found then raise exception 'Session not found'; end if;
  if s.used then raise exception 'Session already verified'; end if;

  elapsed := extract(epoch from (now()-s.started_at))::int;
  if elapsed < 5 then raise exception 'Completion time is invalid'; end if;
  if s.mode='speed_run' and elapsed > 300 then raise exception 'Speed Run time expired'; end if;
  if array_length(p_board,1) <> 9 then raise exception 'Invalid board'; end if;

  for r in 1..9 loop
    if length(p_board[r]) <> 9 then raise exception 'Invalid board row'; end if;
    for c in 1..9 loop
      if substring(p_board[r] from c for 1) !~ '^[1-9]$' then raise exception 'Board must be complete'; end if;
      n := substring(p_board[r] from c for 1)::int;
      if substring(s.puzzle[r] from c for 1)<>'.'
         and substring(s.puzzle[r] from c for 1)<>'0'
         and n<>substring(s.puzzle[r] from c for 1)::int then
        raise exception 'Original puzzle was changed';
      end if;
    end loop;
  end loop;

  for r in 1..9 loop
    seen := array_fill(false,ARRAY[10]);
    for c in 1..9 loop
      n := substring(p_board[r] from c for 1)::int;
      if seen[n] then raise exception 'Invalid row'; end if;
      seen[n] := true;
    end loop;
  end loop;

  for c in 1..9 loop
    seen := array_fill(false,ARRAY[10]);
    for r in 1..9 loop
      n := substring(p_board[r] from c for 1)::int;
      if seen[n] then raise exception 'Invalid column'; end if;
      seen[n] := true;
    end loop;
  end loop;

  for br in 0..2 loop
    for bc in 0..2 loop
      seen := array_fill(false,ARRAY[10]);
      for r in 1..3 loop
        for c in 1..3 loop
          n := substring(p_board[br*3+r] from bc*3+c for 1)::int;
          if seen[n] then raise exception 'Invalid 3x3 box'; end if;
          seen[n] := true;
        end loop;
      end loop;
    end loop;
  end loop;

  final_score := greatest(100,
    case s.difficulty when 'easy' then 1000 when 'medium' then 1500 else 2200 end
    - elapsed*3
  );
  earned_xp := greatest(25,round(final_score/20.0)::int);

  insert into public.game_runs(
    user_id,difficulty,mode,score,completion_time_seconds,xp_earned,
    mistakes,hints_used,daily_date,completed_at
  ) values (
    auth.uid(),s.difficulty,s.mode,final_score,elapsed,earned_xp,
    0,0,s.daily_date,now()
  );

  update public.profiles p set
    xp=p.xp+earned_xp,
    level=floor((p.xp+earned_xp)/100)::int+1,
    wins=p.wins+1,
    current_streak=p.current_streak+1,
    best_streak=greatest(p.best_streak,p.current_streak+1),
    best_time_seconds=case when p.best_time_seconds is null then elapsed else least(p.best_time_seconds,elapsed) end,
    updated_at=now()
  where p.id=auth.uid();

  update public.competitive_sessions set used=true,completed_at=now() where id=s.id;

  return jsonb_build_object(
    'verified',true,
    'elapsed_seconds',elapsed,
    'score',final_score,
    'xp_earned',earned_xp,
    'mode',s.mode,
    'difficulty',s.difficulty
  );
end;
$$;
