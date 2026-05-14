INSERT INTO marketplace_listings (
    id,
    name,
    slug,
    summary,
    description,
    publisher,
    category_slug,
    package_kind,
    repository_slug,
    visibility,
    tags,
    capabilities,
    install_count,
    average_rating,
    created_at,
    updated_at
)
VALUES
(
    '0196f31e-0000-7000-8000-000000310001',
    'Rubric grader',
    'rubric-grader',
    'LLM-backed evaluator that grades generated text against a dynamic rubric.',
    'Installs a published Logic evaluator function with Boolean and numeric rubric metrics plus string debug rationale.',
    'OpenFoundry Evals',
    'ai-agents',
    'ai_agent',
    'eval-rubric-grader',
    'private',
    jsonb_build_array('aip-evals', 'llm-as-judge', 'rubric'),
    jsonb_build_array('boolean-pass', 'numeric-score', 'debug-rationale'),
    1,
    4.8,
    NOW(),
    NOW()
),
(
    '0196f31e-0000-7000-8000-000000310002',
    'Contains key details',
    'contains-key-details',
    'LLM-backed evaluator that checks whether all required details are present.',
    'Installs a published Logic evaluator function with pass, coverage, and missing-detail debug outputs.',
    'OpenFoundry Evals',
    'ai-agents',
    'ai_agent',
    'eval-contains-key-details',
    'private',
    jsonb_build_array('aip-evals', 'llm-as-judge', 'details'),
    jsonb_build_array('boolean-pass', 'coverage-score', 'debug-details'),
    0,
    0,
    NOW(),
    NOW()
),
(
    '0196f31e-0000-7000-8000-000000310003',
    'ROUGE score',
    'rouge-score',
    'Python evaluator for ROUGE-style similarity metrics on summaries and generated text.',
    'Installs a Python evaluator function and runtime dependencies for ROUGE-1 and ROUGE-L metrics.',
    'OpenFoundry Evals',
    'ai-agents',
    'ai_agent',
    'eval-rouge-score',
    'private',
    jsonb_build_array('aip-evals', 'rouge', 'summarization'),
    jsonb_build_array('rouge-1', 'rouge-l', 'python-runtime'),
    0,
    0,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO marketplace_package_versions (
    id,
    listing_id,
    version,
    release_channel,
    changelog,
    dependency_mode,
    dependencies,
    packaged_resources,
    manifest,
    published_at
)
VALUES
(
    '0196f31e-0000-7000-8000-000000310101',
    '0196f31e-0000-7000-8000-000000310001',
    '1.0.0',
    'stable',
    'Initial rubric grader evaluator package.',
    'strict',
    jsonb_build_array(
        jsonb_build_object('package_slug', 'openfoundry-llm-judge-runtime', 'version_req', '^1.2', 'required', true),
        jsonb_build_object('package_slug', 'eval-debug-viewer', 'version_req', '^1.0', 'required', true)
    ),
    jsonb_build_array(
        jsonb_build_object('kind', 'logic_function', 'name', 'Rubric grader', 'resource_ref', 'logic.marketplace.rubric-grader', 'required', true)
    ),
    jsonb_build_object(
        'evaluator_kind', 'marketplace_function',
        'function_rid', 'logic.marketplace.rubric-grader',
        'function_kind', 'logic',
        'return_metrics', jsonb_build_array('rubric.passed', 'rubric.score'),
        'debug_outputs', jsonb_build_array('rubric.rationale')
    ),
    NOW()
),
(
    '0196f31e-0000-7000-8000-000000310102',
    '0196f31e-0000-7000-8000-000000310002',
    '1.0.0',
    'stable',
    'Initial contains-key-details evaluator package.',
    'strict',
    jsonb_build_array(
        jsonb_build_object('package_slug', 'openfoundry-llm-judge-runtime', 'version_req', '^1.2', 'required', true),
        jsonb_build_object('package_slug', 'key-detail-template-pack', 'version_req', '^1.0', 'required', false)
    ),
    jsonb_build_array(
        jsonb_build_object('kind', 'logic_function', 'name', 'Contains key details', 'resource_ref', 'logic.marketplace.contains-key-details', 'required', true)
    ),
    jsonb_build_object(
        'evaluator_kind', 'marketplace_function',
        'function_rid', 'logic.marketplace.contains-key-details',
        'function_kind', 'logic',
        'return_metrics', jsonb_build_array('details.containsAll', 'details.coverage'),
        'debug_outputs', jsonb_build_array('details.missingDetails')
    ),
    NOW()
),
(
    '0196f31e-0000-7000-8000-000000310103',
    '0196f31e-0000-7000-8000-000000310003',
    '1.0.0',
    'stable',
    'Initial ROUGE score evaluator package.',
    'strict',
    jsonb_build_array(
        jsonb_build_object('package_slug', 'python-text-eval-runtime', 'version_req', '^2.0', 'required', true),
        jsonb_build_object('package_slug', 'rouge-metrics-wheel', 'version_req', '~0.1', 'required', true)
    ),
    jsonb_build_array(
        jsonb_build_object('kind', 'python_function', 'name', 'ROUGE score', 'resource_ref', 'fn.marketplace.rouge_score.py', 'required', true)
    ),
    jsonb_build_object(
        'evaluator_kind', 'marketplace_function',
        'function_rid', 'fn.marketplace.rouge_score.py',
        'function_kind', 'python',
        'return_metrics', jsonb_build_array('rouge.rouge1', 'rouge.rougeL'),
        'debug_outputs', jsonb_build_array('rouge.debugSummary')
    ),
    NOW()
)
ON CONFLICT (id) DO NOTHING;
