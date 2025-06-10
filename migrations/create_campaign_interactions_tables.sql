-- Create tables for campaign interactions

-- Campaign Comments Table
CREATE TABLE IF NOT EXISTS campaign_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Comment Likes Table
CREATE TABLE IF NOT EXISTS comment_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    comment_id UUID NOT NULL REFERENCES campaign_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);

-- Campaign Updates Table
CREATE TABLE IF NOT EXISTS campaign_updates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_campaign_comments_campaign_id ON campaign_comments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_comments_user_id ON campaign_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id ON comment_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_updates_campaign_id ON campaign_updates(campaign_id);

-- Add RLS policies
ALTER TABLE campaign_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_updates ENABLE ROW LEVEL SECURITY;

-- Comments policies
CREATE POLICY "Anyone can view comments" ON campaign_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can post comments" ON campaign_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comments" ON campaign_comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON campaign_comments FOR DELETE USING (auth.uid() = user_id);

-- Likes policies
CREATE POLICY "Anyone can view likes" ON comment_likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like" ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike own likes" ON comment_likes FOR DELETE USING (auth.uid() = user_id);

-- Updates policies
CREATE POLICY "Anyone can view updates" ON campaign_updates FOR SELECT USING (true);
CREATE POLICY "Campaign creators can post updates" ON campaign_updates FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM campaigns 
        WHERE id = campaign_id AND creator_id = auth.uid()
    )
);

-- Create views for comments with like counts
CREATE OR REPLACE VIEW campaign_comments_with_likes AS
SELECT 
    cc.*,
    COALESCE(like_counts.likes_count, 0) as likes_count,
    CASE WHEN user_likes.user_id IS NOT NULL THEN true ELSE false END as is_liked
FROM campaign_comments cc
LEFT JOIN (
    SELECT comment_id, COUNT(*) as likes_count
    FROM comment_likes
    GROUP BY comment_id
) like_counts ON cc.id = like_counts.comment_id
LEFT JOIN comment_likes user_likes ON cc.id = user_likes.comment_id AND user_likes.user_id = auth.uid();
