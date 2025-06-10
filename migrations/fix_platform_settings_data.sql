-- Fix existing platform settings data format

-- First, let's see what we have
-- SELECT setting_key, setting_value, category FROM platform_settings ORDER BY category, setting_key;

-- Update string values that are stored without proper JSON quotes
UPDATE platform_settings 
SET setting_value = '"' || setting_value || '"'
WHERE setting_key IN (
    'platform_name', 
    'platform_description', 
    'support_email', 
    'platform_url',
    'refund_policy'
) 
AND setting_value NOT LIKE '"%"'
AND setting_value NOT LIKE '[%'
AND setting_value NOT LIKE '{%'
AND setting_value NOT IN ('true', 'false')
AND setting_value !~ '^[0-9]+\.?[0-9]*$';

-- Update boolean values to proper JSON format
UPDATE platform_settings 
SET setting_value = CASE 
    WHEN setting_value = 't' OR setting_value = 'true' OR setting_value = '1' THEN 'true'
    WHEN setting_value = 'f' OR setting_value = 'false' OR setting_value = '0' THEN 'false'
    ELSE setting_value
END
WHERE setting_key IN (
    'maintenance_mode',
    'registration_enabled',
    'approval_required',
    'email_verification_required',
    'organization_approval_required',
    'account_deletion_enabled',
    'email_notifications_enabled',
    'sms_notifications_enabled',
    'campaign_updates_enabled',
    'system_alerts_enabled',
    'two_factor_required'
);

-- Ensure numeric values are stored as proper JSON numbers (not strings)
UPDATE platform_settings 
SET setting_value = setting_value::text
WHERE setting_key IN (
    'max_campaign_duration',
    'min_funding_goal',
    'max_funding_goal',
    'featured_campaigns_limit',
    'platform_fee_percentage',
    'minimum_contribution',
    'maximum_contribution',
    'max_campaigns_per_user',
    'password_min_length',
    'session_timeout_minutes',
    'max_login_attempts'
)
AND setting_value ~ '^[0-9]+\.?[0-9]*$';

-- Verify the updates
SELECT 
    category,
    setting_key, 
    setting_value,
    CASE 
        WHEN setting_value::text ~ '^".*"$' THEN 'string'
        WHEN setting_value::text IN ('true', 'false') THEN 'boolean'
        WHEN setting_value::text ~ '^[0-9]+\.?[0-9]*$' THEN 'number'
        WHEN setting_value::text ~ '^\[.*\]$' THEN 'array'
        WHEN setting_value::text ~ '^\{.*\}$' THEN 'object'
        ELSE 'unknown'
    END as value_type
FROM platform_settings 
ORDER BY category, setting_key;
