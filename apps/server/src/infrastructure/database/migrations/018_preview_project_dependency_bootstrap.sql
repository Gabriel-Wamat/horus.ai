UPDATE frontend_projects
SET command_catalog =
  jsonb_build_array(
    jsonb_build_object(
      'id', 'install-root-dependencies',
      'label', 'Install dependencies',
      'executable',
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM jsonb_array_elements(command_catalog) AS command
            WHERE command->>'executable' = 'pnpm'
          ) THEN 'pnpm'
          WHEN EXISTS (
            SELECT 1
            FROM jsonb_array_elements(command_catalog) AS command
            WHERE command->>'executable' = 'yarn'
          ) THEN 'yarn'
          WHEN EXISTS (
            SELECT 1
            FROM jsonb_array_elements(command_catalog) AS command
            WHERE command->>'executable' = 'bun'
          ) THEN 'bun'
          ELSE 'npm'
        END,
      'args', jsonb_build_array('install'),
      'cwd', '.',
      'env', '{}'::jsonb,
      'timeoutMs', 120000
    )
  ) || command_catalog
WHERE project_kind = 'generated'
  AND root_path LIKE 'project-workspaces/%'
  AND command_catalog <> '[]'::jsonb
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(command_catalog) AS command
    WHERE command->>'id' = 'install-root-dependencies'
  );
