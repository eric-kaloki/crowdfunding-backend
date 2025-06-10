-- Function to get comment counts for multiple campaigns
CREATE OR REPLACE FUNCTION get_campaign_comments_count(campaign_ids UUID[])
RETURNS TABLE(campaign_id UUID, count BIGINT)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cc.campaign_id,
        COUNT(cc.id) as count
    FROM campaign_comments cc
    WHERE cc.campaign_id = ANY(campaign_ids)
    GROUP BY cc.campaign_id;
END;
$$;

-- Function to get contribution counts for multiple campaigns
CREATE OR REPLACE FUNCTION get_campaign_contributions_count(campaign_ids UUID[])
RETURNS TABLE(campaign_id UUID, count BIGINT)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.campaign_id,
        COUNT(c.id) as count
    FROM contributions c
    WHERE c.campaign_id = ANY(campaign_ids)
    GROUP BY c.campaign_id;
END;
$$;
