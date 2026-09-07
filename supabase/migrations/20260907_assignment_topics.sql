-- An assignment can cover several syllabus topics.
--
-- assignment.curriculum_topic_id is one FK, which fits daily homework
-- but not the thing teachers actually asked for: a "grand test" over
-- Biology 1-4 could only be tagged with one of them (pilot, 7 Sep).
--
-- The legacy column STAYS and always mirrors the first topic - the
-- portal, feeds and any stale client keep working unchanged. This
-- table carries the full set.

create table if not exists assignment_topic (
  assignment_id       uuid not null,
  curriculum_topic_id uuid not null,
  primary key (assignment_id, curriculum_topic_id)
);

-- "Which assignments touch this topic?" for coverage views.
create index if not exists assignment_topic_by_topic
  on assignment_topic (curriculum_topic_id);

-- Every existing single-topic assignment is a one-row set.
insert into assignment_topic (assignment_id, curriculum_topic_id)
select id, curriculum_topic_id from assignment
where curriculum_topic_id is not null
on conflict do nothing;
