import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Copy, Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatDimensions } from '@/lib/kdpUtils';

interface KdpPrepDashboardProps {
  title: string;
  topic: string;
  subtitle?: string;
  authorName: string;
  contentPageCount: number;
  bookData?: any;
}

const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_KEYWORDS = 7;

const KdpPrepDashboard = ({
  title,
  topic,
  subtitle: initialSubtitle,
  authorName,
  contentPageCount,
  bookData,
}: KdpPrepDashboardProps) => {
  // Metadata state
  const [localSubtitle, setLocalSubtitle] = useState(initialSubtitle || '');
  const [author, setAuthor] = useState(authorName);
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState<string[]>(Array(7).fill(''));
  
  // Loading states
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isGeneratingSubtitle, setIsGeneratingSubtitle] = useState(false);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [copiedDescription, setCopiedDescription] = useState(false);
  
  // Get formatted dimensions for display
  const dims = formatDimensions(contentPageCount);
  
  // Generate description with AI
  const handleGenerateDescription = useCallback(async () => {
    setIsGeneratingDescription(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-book-v2', {
        body: {
          mode: 'kdp-description',
          title,
          topic,
          subtitle: localSubtitle,
          bookData,
        },
      });
      
      if (error) throw error;
      
      if (data?.description) {
        setDescription(data.description.slice(0, MAX_DESCRIPTION_LENGTH));
        toast.success('Best-selling description generated!');
      }
    } catch (err) {
      console.error('Failed to generate description:', err);
      toast.error('Failed to generate description');
    } finally {
      setIsGeneratingDescription(false);
    }
  }, [title, topic, localSubtitle, bookData]);
  
  // Generate subtitle with AI
  const handleGenerateSubtitle = useCallback(async () => {
    setIsGeneratingSubtitle(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-book-v2', {
        body: {
          mode: 'kdp-subtitle',
          title,
          topic,
        },
      });
      
      if (error) throw error;
      
      if (data?.subtitle) {
        setLocalSubtitle(data.subtitle);
        toast.success('Subtitle generated!');
      }
    } catch (err) {
      console.error('Failed to generate subtitle:', err);
      toast.error('Failed to generate subtitle');
    } finally {
      setIsGeneratingSubtitle(false);
    }
  }, [title, topic]);
  
  // Generate all 7 keywords with AI
  const handleGenerateKeywords = useCallback(async () => {
    setIsGeneratingKeywords(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-book-v2', {
        body: {
          mode: 'kdp-keywords',
          title,
          topic,
          subtitle: localSubtitle,
        },
      });
      
      if (error) throw error;
      
      if (data?.keywords && Array.isArray(data.keywords)) {
        const newKeywords = [...data.keywords.slice(0, 7)];
        while (newKeywords.length < 7) newKeywords.push('');
        setKeywords(newKeywords);
        toast.success('7 unique keywords generated!');
      }
    } catch (err) {
      console.error('Failed to generate keywords:', err);
      toast.error('Failed to generate keywords');
    } finally {
      setIsGeneratingKeywords(false);
    }
  }, [title, topic, localSubtitle]);
  
  // Copy description to clipboard
  const handleCopyDescription = useCallback(async () => {
    if (!description) {
      toast.error('No description to copy');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(description);
      setCopiedDescription(true);
      toast.success('Description copied to clipboard!');
      setTimeout(() => setCopiedDescription(false), 2000);
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  }, [description]);
  
  // Update single keyword
  const handleKeywordChange = (index: number, value: string) => {
    const newKeywords = [...keywords];
    newKeywords[index] = value;
    setKeywords(newKeywords);
  };
  
  return (
    <div className="space-y-4 h-full">
      {/* Live Specs Header Bar */}
      <div className="flex flex-wrap items-center justify-center gap-4 p-3 bg-muted/50 rounded-lg border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Page Count:</span>
          <span className="text-sm font-medium">{dims.pageCount}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Spine:</span>
          <span className="text-sm font-medium">{dims.spineWidth}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Trim:</span>
          <span className="text-sm font-medium">{dims.trimSize}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Bleed:</span>
          <span className="text-sm font-medium">{dims.bleed}</span>
        </div>
      </div>
      
      {/* Two-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 flex-1">
        {/* Column 1: Description (60% width) */}
        <div className="md:col-span-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="description" className="text-sm font-medium">
              Book Description (HTML)
            </Label>
            <span className={`text-xs ${description.length > MAX_DESCRIPTION_LENGTH * 0.9 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {description.length} / {MAX_DESCRIPTION_LENGTH}
            </span>
          </div>
          
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
            placeholder="Your Amazon book description with HTML tags (<b>, <ul>, <li>)..."
            className="flex-1 min-h-[200px] font-mono text-sm resize-none"
          />
          
          <div className="flex gap-2">
            <Button
              onClick={handleGenerateDescription}
              disabled={isGeneratingDescription}
              variant="default"
              className="gap-2"
            >
              {isGeneratingDescription ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Write Best-Selling Description
            </Button>
            
            <Button
              onClick={handleCopyDescription}
              variant="outline"
              disabled={!description}
              className="gap-2"
            >
              {copiedDescription ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              Copy to Clipboard
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground">
            HTML tags supported: &lt;b&gt;, &lt;i&gt;, &lt;u&gt;, &lt;br&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;ol&gt;, &lt;li&gt;
          </p>
        </div>
        
        {/* Column 2: Metadata Fields (40% width) */}
        <div className="md:col-span-2 space-y-4">
          {/* Title (Locked) */}
          <div>
            <Label htmlFor="title" className="text-sm font-medium">Title</Label>
            <Input
              id="title"
              value={title}
              disabled
              className="mt-1 bg-muted"
            />
          </div>
          
          {/* Author */}
          <div>
            <Label htmlFor="author" className="text-sm font-medium">Author</Label>
            <Input
              id="author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author name..."
              className="mt-1"
            />
          </div>
          
          {/* Subtitle */}
          <div>
            <Label htmlFor="subtitle" className="text-sm font-medium">Subtitle</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="subtitle"
                value={localSubtitle}
                onChange={(e) => setLocalSubtitle(e.target.value)}
                placeholder="Book subtitle..."
                className="flex-1"
              />
              <Button
                onClick={handleGenerateSubtitle}
                disabled={isGeneratingSubtitle}
                variant="outline"
                size="icon"
                title="Generate subtitle"
              >
                {isGeneratingSubtitle ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          
          {/* Keywords Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Keywords ({keywords.filter(k => k).length}/7)</Label>
              <Button
                onClick={handleGenerateKeywords}
                disabled={isGeneratingKeywords}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                {isGeneratingKeywords ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Generate All
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {keywords.map((keyword, index) => (
                <Input
                  key={index}
                  value={keyword}
                  onChange={(e) => handleKeywordChange(index, e.target.value)}
                  placeholder={`Keyword ${index + 1}...`}
                  className="text-sm"
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Use long-tail phrases (3-5 words) for better discoverability
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KdpPrepDashboard;
