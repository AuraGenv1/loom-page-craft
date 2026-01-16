import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ChapterInfo } from '@/lib/bookTypes';
import { AlertTriangle, ImageIcon, Key, Pencil, Save, X, RefreshCw, Check, Upload } from 'lucide-react';
import WeavingLoader from '@/components/WeavingLoader';
import ReactMarkdown from 'react-markdown';
import LocalResources from '@/components/LocalResources';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface AllChaptersContentProps {
  topic: string;
  bookData: any;
  loadingChapter?: number | null;
  isFullAccess?: boolean;
  sessionId?: string;
  bookId?: string;
  onBookDataUpdate?: (newData: any) => void;
}

export interface AllChaptersContentHandle {
  scrollToChapter: (chapterNumber: number) => void;
  getChapterRefs: () => (HTMLElement | null)[];
}

const AllChaptersContent = forwardRef<AllChaptersContentHandle, AllChaptersContentProps>(
  ({ topic, bookData, loadingChapter, isFullAccess, sessionId, bookId, onBookDataUpdate }, ref) => {
    const chapterRefs = useRef<(HTMLElement | null)[]>([]);
    const [inlineImages, setInlineImages] = useState<Record<string, string>>({});
    const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
    const [generatedChapters, setGeneratedChapters] = useState<Set<number>>(new Set());
    
    // Admin editing state
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState<Record<number, string>>({});
    const [editedTitles, setEditedTitles] = useState<Record<number, string>>({});
    // Separate image captions from body text for safe editing
    const [editedImageCaptions, setEditedImageCaptions] = useState<Record<number, string>>({});
    const [editedBodyText, setEditedBodyText] = useState<Record<number, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [regenerateDialog, setRegenerateDialog] = useState<{ chapterNum: number; currentAlt: string } | null>(null);
    const [newImagePrompt, setNewImagePrompt] = useState('');
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [isUploadingChapterImage, setIsUploadingChapterImage] = useState(false);
    const chapterImageInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      scrollToChapter: (num) => chapterRefs.current[num - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      getChapterRefs: () => chapterRefs.current,
    }));

    // Parse image and body text from markdown content
    const parseImageAndBody = (markdownContent: string) => {
      const imageMatch = markdownContent.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (imageMatch) {
        const imageMarkdown = imageMatch[0];
        const caption = imageMatch[1];
        const url = imageMatch[2];
        const bodyText = markdownContent.replace(imageMarkdown, '').trim();
        return { caption, url, bodyText, hasImage: true };
      }
      return { caption: '', url: '', bodyText: markdownContent, hasImage: false };
    };

    // Initialize edited content when entering edit mode - split image from body
    const handleEnterEditMode = () => {
      const contentMap: Record<number, string> = {};
      const titleMap: Record<number, string> = {};
      const captionMap: Record<number, string> = {};
      const bodyMap: Record<number, string> = {};
      
      for (let i = 1; i <= 10; i++) {
        const content = bookData[`chapter${i}Content`];
        if (content) {
          contentMap[i] = content;
          const parsed = parseImageAndBody(content);
          captionMap[i] = parsed.caption;
          bodyMap[i] = parsed.bodyText;
        }
        const tocEntry = bookData.tableOfContents?.find((c: any) => c.chapter === i);
        if (tocEntry) titleMap[i] = tocEntry.title;
      }
      setEditedContent(contentMap);
      setEditedTitles(titleMap);
      setEditedImageCaptions(captionMap);
      setEditedBodyText(bodyMap);
      setIsEditing(true);
    };

    const handleCancelEdit = () => {
      setIsEditing(false);
      setEditedContent({});
      setEditedTitles({});
      setEditedImageCaptions({});
      setEditedBodyText({});
    };

    const handleSaveChanges = async () => {
      if (!bookId) {
        toast.error('No book ID available');
        return;
      }

      setIsSaving(true);
      try {
        // Build update object for chapters - recombine image and body text
        const updateData: Record<string, any> = {};
        
        for (const [chapterNumStr, originalContent] of Object.entries(editedContent)) {
          const chapterNum = parseInt(chapterNumStr);
          const parsed = parseImageAndBody(originalContent);
          
          // Get updated caption and body
          const newCaption = editedImageCaptions[chapterNum] ?? parsed.caption;
          const newBody = editedBodyText[chapterNum] ?? parsed.bodyText;
          
          // Recombine: if there was an image, preserve it with updated caption
          let finalContent: string;
          if (parsed.hasImage) {
            finalContent = `![${newCaption}](${parsed.url})\n\n${newBody}`;
          } else {
            finalContent = newBody;
          }
          
          updateData[`chapter${chapterNum}_content`] = finalContent;
        }

        // Update table of contents with new titles
        const updatedToc = bookData.tableOfContents?.map((entry: any) => ({
          ...entry,
          title: editedTitles[entry.chapter] || entry.title,
        })) || [];
        updateData.table_of_contents = updatedToc;

        const { error } = await supabase
          .from('books')
          .update(updateData)
          .eq('id', bookId);

        if (error) throw error;

        // Update local state via callback
        if (onBookDataUpdate) {
          const newBookData = { ...bookData };
          
          for (const [chapterNumStr, originalContent] of Object.entries(editedContent)) {
            const chapterNum = parseInt(chapterNumStr);
            const parsed = parseImageAndBody(originalContent);
            const newCaption = editedImageCaptions[chapterNum] ?? parsed.caption;
            const newBody = editedBodyText[chapterNum] ?? parsed.bodyText;
            
            let finalContent: string;
            if (parsed.hasImage) {
              finalContent = `![${newCaption}](${parsed.url})\n\n${newBody}`;
            } else {
              finalContent = newBody;
            }
            
            newBookData[`chapter${chapterNum}Content`] = finalContent;
          }
          
          newBookData.tableOfContents = updatedToc;
          onBookDataUpdate(newBookData);
        }

        toast.success('Changes saved successfully!');
        setIsEditing(false);
        setEditedContent({});
        setEditedTitles({});
        setEditedImageCaptions({});
        setEditedBodyText({});
      } catch (err) {
        console.error('Save failed:', err);
        toast.error('Failed to save changes');
      } finally {
        setIsSaving(false);
      }
    };

    const handleRegenerateImage = async () => {
      if (!regenerateDialog || !newImagePrompt.trim()) return;

      setIsRegenerating(true);
      try {
        const { data, error } = await supabase.functions.invoke('generate-cover-image', {
          body: { 
            topic, 
            caption: newImagePrompt.trim(), 
            variant: 'diagram', 
            sessionId 
          },
        });

        if (error) throw error;
        if (!data?.imageUrl) throw new Error('No image returned');

        const chapterNum = regenerateDialog.chapterNum;
        const currentContent = editedContent[chapterNum] || bookData[`chapter${chapterNum}Content`] || '';
        
        // Force browser to reload image by appending timestamp
        const timestamp = Date.now();
        const cleanUrl = data.imageUrl.split('?')[0]; // Remove existing params if any
        const newUrl = `${cleanUrl}?t=${timestamp}&w=800&q=80`;
        
        // Replace the first image in the markdown with new one
        const newContent = currentContent.replace(
          /!\[([^\]]*)\]\(([^)]+)\)/,
          `![${newImagePrompt.trim()}](${newUrl})`
        );

        setEditedContent(prev => ({ ...prev, [chapterNum]: newContent }));
        
        // Also update the inline cache with the new timestamped URL
        const imageId = `ch${chapterNum}-img-${newImagePrompt.trim().replace(/\s+/g, '-').substring(0, 20)}`;
        setInlineImages(prev => ({ ...prev, [imageId]: newUrl }));

        toast.success('Image regenerated!');
        setRegenerateDialog(null);
        setNewImagePrompt('');
      } catch (err) {
        console.error('Image regeneration failed:', err);
        toast.error('Failed to regenerate image');
      } finally {
        setIsRegenerating(false);
      }
    };

    const generateImage = async (id: string, description: string, chapterNum: number) => {
      // Limit to ONE image per chapter for luxury aesthetic
      if (generatedChapters.has(chapterNum) || inlineImages[id] || loadingImages.has(id)) return;
      
      setGeneratedChapters(prev => new Set(prev).add(chapterNum));
      setLoadingImages(prev => new Set(prev).add(id));
      try {
        console.log("Generating image for chapter", chapterNum, ":", description);
        const { data, error } = await supabase.functions.invoke('generate-cover-image', {
          body: { topic, caption: description, variant: 'diagram', sessionId },
        });
        if (!error && data?.imageUrl) {
          setInlineImages(prev => ({ ...prev, [id]: data.imageUrl }));
        }
      } catch (e) {
        console.error("Image gen failed", e);
      } finally {
        setLoadingImages(prev => { const n = new Set(prev); n.delete(id); return n; });
      }
    };

    // Extract first image from content for placement after title
    const extractPrimaryImage = (markdownContent: string) => {
      const imageMatch = markdownContent.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (imageMatch) {
        return { alt: imageMatch[1], src: imageMatch[2] };
      }
      return null;
    };

    // Remove images from content for separate placement
    const contentWithoutImages = (markdownContent: string) => {
      return markdownContent.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
    };

    // SYNCED MARKDOWN COMPONENTS - Matches ChapterContent exactly
    const createMarkdownComponents = (chapterNum: number) => ({
      // IMAGE HANDLER - Skip, images handled separately
      img: () => null,

      // PRO-TIP HANDLER - "The Onyx" Luxury Design Style (EXACT match with ChapterContent)
      blockquote: ({ children }: any) => {
        // Extract text content recursively from React children
        const extractText = (node: any): string => {
          if (typeof node === 'string') return node;
          if (typeof node === 'number') return String(node);
          if (!node) return '';
          if (Array.isArray(node)) return node.map(extractText).join('');
          if (node.props?.children) return extractText(node.props.children);
          return '';
        };
        
        const textContent = extractText(children);
        const isProTip = textContent.toLowerCase().includes('pro-tip') || textContent.toLowerCase().includes('pro tip');
        
        if (isProTip) {
          const cleanText = textContent.replace(/\*?\*?pro[- ]?tip:?\*?\*?/gi, "").replace(/\*\*/g, "").trim();
          return (
            <div className="my-8 p-6 bg-white border-l-4 border-black">
              <div className="flex items-start gap-3">
                <Key className="w-4 h-4 text-black flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold tracking-[0.2em] uppercase text-black mb-2">
                    PRO TIP
                  </p>
                  <p className="font-serif text-gray-800 italic leading-relaxed text-lg">
                    {cleanText}
                  </p>
                </div>
              </div>
            </div>
          );
        }
        return (
          <blockquote className="border-l-2 border-foreground/15 pl-8 my-10 italic text-foreground/60 font-serif text-lg md:text-xl">
            {children}
          </blockquote>
        );
      },

      // TYPOGRAPHY - Synced with ChapterContent
      h1: ({ children }: any) => <h1 className="text-4xl font-display font-bold text-foreground mt-10 mb-4">{children}</h1>,
      h2: ({ children }: any) => <h2 className="text-3xl font-display font-bold text-foreground mt-8 mb-3">{children}</h2>,
      h3: ({ children }: any) => <h3 className="text-2xl font-display font-semibold text-foreground mt-6 mb-2">{children}</h3>,
      p: ({ children }: any) => <p className="text-foreground/80 font-serif leading-relaxed text-lg mb-6">{children}</p>,
      ul: ({ children }: any) => <ul className="list-disc pl-6 my-4 space-y-2">{children}</ul>,
      li: ({ children }: any) => <li className="text-foreground/80 font-serif leading-relaxed">{children}</li>,
    });

    // Primary Image Component for each chapter
    const handleChapterImageUpload = async (chapterNum: number, file: File, currentAlt: string) => {
      if (!file || !sessionId) return;
      
      // Validate file
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }

      setIsUploadingChapterImage(true);
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `chapter-${chapterNum}-${Date.now()}.${fileExt}`;
        const filePath = `${sessionId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('book-images')
          .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('book-images')
          .getPublicUrl(filePath);

        const newUrl = urlData.publicUrl;
        const timestamp = Date.now();
        const finalUrl = `${newUrl}?t=${timestamp}`;

        // Update the chapter content with new image URL
        const currentContent = editedContent[chapterNum] || bookData[`chapter${chapterNum}Content`] || '';
        const newContent = currentContent.replace(
          /!\[([^\]]*)\]\(([^)]+)\)/,
          `![Uploaded Image](${finalUrl})`
        );

        setEditedContent(prev => ({ ...prev, [chapterNum]: newContent }));
        
        // Update inline images cache
        const imageId = `ch${chapterNum}-img-uploaded-${timestamp}`;
        setInlineImages(prev => ({ ...prev, [imageId]: finalUrl }));

        toast.success('Image uploaded successfully!');
      } catch (err) {
        console.error('Chapter image upload failed:', err);
        toast.error('Failed to upload image');
      } finally {
        setIsUploadingChapterImage(false);
      }
    };

    const PrimaryImageSection = ({ chapterNum, content }: { chapterNum: number; content: string }) => {
      const primaryImage = extractPrimaryImage(content);
      if (!primaryImage) return null;
      
      const imageId = `ch${chapterNum}-img-${(primaryImage.alt || 'default').replace(/\s+/g, '-').substring(0, 20)}`;
      
      // Trigger generation if not exists
      if (sessionId && !inlineImages[imageId] && !loadingImages.has(imageId) && !generatedChapters.has(chapterNum)) {
        setTimeout(() => generateImage(imageId, primaryImage.alt || topic, chapterNum), 100);
      }

      const displayUrl = inlineImages[imageId] || primaryImage.src;
      const isLoading = loadingImages.has(imageId);

      return (
        <div className="my-8 flex flex-col items-center">
          <div className="relative w-full max-w-xl h-60 bg-secondary/30 rounded-lg flex items-center justify-center overflow-hidden group">
            {isLoading ? (
              <div className="flex flex-col items-center">
                <ImageIcon className="w-10 h-10 text-muted-foreground" />
                <Skeleton className="h-4 w-32 mt-2" />
              </div>
            ) : (
              <>
                <img src={displayUrl} alt={primaryImage.alt || 'Chapter illustration'} className="object-cover w-full h-full" />
                {isEditing && (
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setRegenerateDialog({ chapterNum, currentAlt: primaryImage.alt || '' });
                        setNewImagePrompt(primaryImage.alt || '');
                      }}
                      className="gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Regenerate
                    </Button>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id={`chapter-image-upload-${chapterNum}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleChapterImageUpload(chapterNum, file, primaryImage.alt || '');
                        }
                        e.target.value = '';
                      }}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isUploadingChapterImage}
                      onClick={() => document.getElementById(`chapter-image-upload-${chapterNum}`)?.click()}
                      className="gap-2"
                    >
                      {isUploadingChapterImage ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      Upload
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
          {primaryImage.alt && <p className="text-sm text-muted-foreground mt-2 text-center">{primaryImage.alt}</p>}
        </div>
      );
    };

    const chapters = Array.from({ length: 10 }, (_, i) => ({
      number: i + 1,
      content: bookData[`chapter${i + 1}Content`]
    }));

    return (
      <div className="relative z-10">
        {/* Admin Toolbar - Only visible when isFullAccess */}
        {isFullAccess && (
          <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border p-4 mb-6 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              <span className="font-medium text-foreground">
                {isEditing ? 'Edit Mode Active' : 'Admin Tools'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {isEditing ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="gap-2"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveChanges}
                    disabled={isSaving}
                    className="gap-2"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEnterEditMode}
                  className="gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  Edit Mode
                </Button>
              )}
            </div>
          </div>
        )}

        {chapters.map((chapter, idx) => {
          const isLocked = !isFullAccess && chapter.number > 1;
          const chapterTitle = isEditing 
            ? editedTitles[chapter.number] || bookData.tableOfContents?.find((c:any) => c.chapter === chapter.number)?.title || `Chapter ${chapter.number}`
            : bookData.tableOfContents?.find((c:any) => c.chapter === chapter.number)?.title || `Chapter ${chapter.number}`;
          const isCurrentlyLoading = loadingChapter === chapter.number;
          const displayContent = isEditing 
            ? editedContent[chapter.number] || chapter.content 
            : chapter.content;
          const cleanContent = displayContent ? contentWithoutImages(displayContent) : '';
          
          return (
            <section
              key={chapter.number}
              ref={(el) => { chapterRefs.current[idx] = el; }}
              className="w-full max-w-3xl mx-auto py-16 px-6 md:px-12 bg-gradient-to-b from-background to-secondary/10 shadow-paper border border-border/20 rounded-sm relative mb-8"
            >
              <header className="mb-8 pb-8 border-b border-border/30">
                <p className="text-sm uppercase tracking-wider text-muted-foreground mb-2">Chapter {chapter.number}</p>
                {isEditing ? (
                  <Input
                    value={editedTitles[chapter.number] || chapterTitle}
                    onChange={(e) => setEditedTitles(prev => ({ ...prev, [chapter.number]: e.target.value }))}
                    className="text-2xl md:text-3xl font-display font-bold border-dashed"
                  />
                ) : (
                  <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground leading-tight">{chapterTitle}</h2>
                )}
              </header>

              {isLocked ? (
                <div className="flex flex-col items-center justify-center h-64 bg-secondary/20 rounded-md text-muted-foreground border border-dashed border-border/70 p-4 text-center">
                  <AlertTriangle className="w-8 h-8 mb-4 text-primary" />
                  <p className="text-lg font-semibold">Unlock the full guide to read this chapter.</p>
                </div>
              ) : (
                <div className="prose prose-lg max-w-none">
                  {displayContent ? (
                    <>
                      {/* Primary Image - Immediately after title, before content */}
                      <PrimaryImageSection chapterNum={chapter.number} content={displayContent} />
                      
                      {isEditing ? (
                        <div className="space-y-6">
                          {/* Image Caption Editor - Separate from body text */}
                          {(() => {
                            const parsed = parseImageAndBody(editedContent[chapter.number] || chapter.content || '');
                            if (parsed.hasImage) {
                              return (
                                <div className="p-4 border border-dashed border-border/50 rounded-lg bg-secondary/10">
                                  <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                                    <ImageIcon className="w-4 h-4" />
                                    Image Caption / Alt Text
                                  </label>
                                  <Input
                                    value={editedImageCaptions[chapter.number] ?? parsed.caption}
                                    onChange={(e) => setEditedImageCaptions(prev => ({ ...prev, [chapter.number]: e.target.value }))}
                                    placeholder="Enter image caption..."
                                    className="border-dashed"
                                  />
                                  <p className="text-xs text-muted-foreground mt-1">
                                    This text is used for accessibility and SEO
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          })()}
                          
                          {/* Body Text Editor - No image markdown */}
                          <div>
                            <label className="text-sm font-medium text-muted-foreground mb-2 block">
                              Chapter Body Text
                            </label>
                            <Textarea
                              value={editedBodyText[chapter.number] ?? parseImageAndBody(editedContent[chapter.number] || chapter.content || '').bodyText}
                              onChange={(e) => setEditedBodyText(prev => ({ ...prev, [chapter.number]: e.target.value }))}
                              className="min-h-[400px] font-mono text-sm border-dashed resize-y"
                              placeholder="Enter markdown content (without images)..."
                            />
                          </div>
                        </div>
                      ) : (
                        <ReactMarkdown components={createMarkdownComponents(chapter.number)}>{cleanContent}</ReactMarkdown>
                      )}
                    </>
                  ) : (
                    // Weaving loader active for chapters 2-10 when generating
                    <WeavingLoader text={`Weaving Chapter ${chapter.number}...`} />
                  )}
                </div>
              )}
              
              {chapter.number === 10 && isFullAccess && bookData.localResources && (
                <LocalResources resources={bookData.localResources} topic={topic} />
              )}
            </section>
          );
        })}

        {/* Image Regeneration Dialog */}
        <Dialog open={!!regenerateDialog} onOpenChange={(open) => !open && setRegenerateDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Regenerate Chapter Image</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground mb-3">
                Enter a new description for the image. This will generate a fresh image from Pexels.
              </p>
              <Input
                value={newImagePrompt}
                onChange={(e) => setNewImagePrompt(e.target.value)}
                placeholder="e.g., Sunset over Barcelona's Gothic Quarter"
                className="w-full"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setRegenerateDialog(null);
                  setNewImagePrompt('');
                }}
                disabled={isRegenerating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRegenerateImage}
                disabled={isRegenerating || !newImagePrompt.trim()}
                className="gap-2"
              >
                {isRegenerating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {isRegenerating ? 'Generating...' : 'Regenerate'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

AllChaptersContent.displayName = 'AllChaptersContent';
export default AllChaptersContent;