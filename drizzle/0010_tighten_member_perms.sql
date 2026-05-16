-- project.member used to carry `project.tasks.assign`, but the assign field
-- isn't enforceable separately from edit yet, and granting it widely lets
-- non-creator members reassign each other's tasks. Restrict to managers
-- (and Trackr-team via their internal-org roles).

DELETE FROM "role_permission"
WHERE "role_id" = 'project.member'
	AND "permission" = 'project.tasks.assign';
