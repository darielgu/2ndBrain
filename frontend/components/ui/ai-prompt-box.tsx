'use client'

import React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  ChevronUp,
  Paperclip,
  Square,
  X,
  Globe,
  BrainCog,
  FolderCode,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const cn = (...classes: (string | undefined | null | false)[]) =>
  classes.filter(Boolean).join(' ')

const styles = `
  *:focus-visible {
    outline-offset: 0 !important;
    --ring-offset: 0 !important;
  }
  textarea::-webkit-scrollbar {
    width: 6px;
  }
  textarea::-webkit-scrollbar-track {
    background: transparent;
  }
  textarea::-webkit-scrollbar-thumb {
    background-color: #444444;
    border-radius: 3px;
  }
  textarea::-webkit-scrollbar-thumb:hover {
    background-color: #555555;
  }
`

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        'min-h-[44px] w-full resize-none rounded-md border-none bg-transparent px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      rows={1}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-md border border-border bg-background px-2.5 py-1 text-xs lowercase text-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      className,
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

const Dialog = DialogPrimitive.Root
const DialogPortal = DialogPrimitive.Portal

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-[90vw] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border border-[#333333] bg-[#1F2023] p-0 shadow-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 md:max-w-[800px]',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 z-10 rounded-full bg-[#2E3033]/80 p-2 transition-all hover:bg-[#2E3033]">
        <X className="h-5 w-5 text-gray-200 hover:text-white" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight text-gray-100',
      className,
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantClasses = {
      default: 'bg-white text-black hover:bg-white/80',
      outline: 'border border-[#444444] bg-transparent hover:bg-[#3A3A40]',
      ghost: 'bg-transparent hover:bg-[#3A3A40]',
    }
    const sizeClasses = {
      default: 'h-10 px-4 py-2',
      sm: 'h-8 px-3 text-sm',
      lg: 'h-12 px-6',
      icon: 'h-8 w-8 rounded-full',
    }

    return (
      <button
        className={cn(
          'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

interface VoiceRecorderProps {
  isRecording: boolean
  onStartRecording: () => void
  onStopRecording: (duration: number) => void
  visualizerBars?: number
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  isRecording,
  onStartRecording,
  onStopRecording,
  visualizerBars = 32,
}) => {
  const [time, setTime] = React.useState(0)
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  React.useEffect(() => {
    if (isRecording) {
      onStartRecording()
      timerRef.current = setInterval(() => setTime((t) => t + 1), 1000)
      return
    }

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (time > 0) {
      onStopRecording(time)
      setTime(0)
    }
  }, [isRecording, onStartRecording, onStopRecording, time])

  React.useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`
  }

  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center py-3 transition-all duration-300',
        isRecording ? 'opacity-100' : 'h-0 opacity-0',
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <span className="font-mono text-sm text-white/80">{formatTime(time)}</span>
      </div>
      <div className="flex h-10 w-full items-center justify-center gap-0.5 px-4">
        {[...Array(visualizerBars)].map((_, i) => (
          <div
            key={i}
            className="w-0.5 animate-pulse rounded-full bg-white/50"
            style={{
              height: `${Math.max(15, Math.random() * 100)}%`,
              animationDelay: `${i * 0.05}s`,
              animationDuration: `${0.5 + Math.random() * 0.5}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

interface ImageViewDialogProps {
  imageUrl: string | null
  onClose: () => void
}

const ImageViewDialog: React.FC<ImageViewDialogProps> = ({
  imageUrl,
  onClose,
}) => {
  if (!imageUrl) {
    return null
  }

  return (
    <Dialog open={!!imageUrl} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] border-none bg-transparent p-0 shadow-none md:max-w-[800px]">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-2xl bg-[#1F2023] shadow-2xl"
        >
          <img
            src={imageUrl}
            alt="Full preview"
            className="max-h-[80vh] w-full rounded-2xl object-contain"
          />
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}

interface PromptInputContextType {
  isLoading: boolean
  value: string
  setValue: (value: string) => void
  maxHeight: number | string
  onSubmit?: () => void
  disabled?: boolean
}

const PromptInputContext = React.createContext<PromptInputContextType>({
  isLoading: false,
  value: '',
  setValue: () => {},
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
})

function usePromptInput() {
  const context = React.useContext(PromptInputContext)
  if (!context) {
    throw new Error('usePromptInput must be used within a PromptInput')
  }
  return context
}

interface PromptInputProps {
  isLoading?: boolean
  value?: string
  onValueChange?: (value: string) => void
  maxHeight?: number | string
  onSubmit?: () => void
  children: React.ReactNode
  className?: string
  disabled?: boolean
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}

const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  (
    {
      className,
      isLoading = false,
      maxHeight = 240,
      value,
      onValueChange,
      onSubmit,
      children,
      disabled = false,
      onDragOver,
      onDragLeave,
      onDrop,
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState(value || '')

    const handleChange = (newValue: string) => {
      setInternalValue(newValue)
      onValueChange?.(newValue)
    }

    return (
      <TooltipProvider>
        <PromptInputContext.Provider
          value={{
            isLoading,
            value: value ?? internalValue,
            setValue: onValueChange ?? handleChange,
            maxHeight,
            onSubmit,
            disabled,
          }}
        >
          <div
            ref={ref}
            className={cn(
              'rounded-2xl border border-border bg-background/80 p-2 shadow-[0_10px_24px_rgba(0,0,0,0.2)] transition-all duration-200 focus-within:border-foreground/40 focus-within:bg-background',
              isLoading && 'border-foreground/50',
              className,
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {children}
          </div>
        </PromptInputContext.Provider>
      </TooltipProvider>
    )
  },
)
PromptInput.displayName = 'PromptInput'

interface PromptInputTextareaProps {
  disableAutosize?: boolean
  placeholder?: string
}

const PromptInputTextarea: React.FC<
  PromptInputTextareaProps & React.ComponentProps<typeof Textarea>
> = ({
  className,
  onKeyDown,
  disableAutosize = false,
  placeholder,
  ...props
}) => {
  const { value, setValue, maxHeight, onSubmit, disabled } = usePromptInput()
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (disableAutosize || !textareaRef.current) {
      return
    }

    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height =
      typeof maxHeight === 'number'
        ? `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
        : `min(${textareaRef.current.scrollHeight}px, ${maxHeight})`
  }, [value, maxHeight, disableAutosize])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit?.()
    }
    onKeyDown?.(e)
  }

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      className={cn('text-sm', className)}
      disabled={disabled}
      placeholder={placeholder}
      {...props}
    />
  )
}

interface PromptInputActionsProps extends React.HTMLAttributes<HTMLDivElement> {}

const PromptInputActions: React.FC<PromptInputActionsProps> = ({
  children,
  className,
  ...props
}) => (
  <div className={cn('flex items-center gap-2', className)} {...props}>
    {children}
  </div>
)

interface PromptInputActionProps extends React.ComponentProps<typeof Tooltip> {
  tooltip: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

const PromptInputAction: React.FC<PromptInputActionProps> = ({
  tooltip,
  children,
  className,
  side = 'top',
  ...props
}) => {
  const { disabled } = usePromptInput()

  return (
    <Tooltip {...props}>
      <TooltipTrigger asChild disabled={disabled}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

const CustomDivider: React.FC = () => (
  <div className="relative mx-1 h-6 w-[1.5px]">
    <div
      className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-border to-transparent"
      style={{
        clipPath:
          'polygon(0% 0%, 100% 0%, 100% 40%, 140% 50%, 100% 60%, 100% 100%, 0% 100%, 0% 60%, -40% 50%, 0% 40%)',
      }}
    />
  </div>
)

interface PromptInputBoxProps {
  onSend?: (message: string, files?: File[]) => void
  isLoading?: boolean
  placeholder?: string
  className?: string
  leftActionsAddon?: React.ReactNode
}

export const PromptInputBox = React.forwardRef(
  (props: PromptInputBoxProps, ref: React.Ref<HTMLDivElement>) => {
    const {
      onSend = () => {},
      isLoading = false,
      placeholder = 'Type your message here...',
      className,
      leftActionsAddon,
    } = props
    const [input, setInput] = React.useState('')
    const [files, setFiles] = React.useState<File[]>([])
    const [filePreviews, setFilePreviews] = React.useState<{ [key: string]: string }>(
      {},
    )
    const [selectedImage, setSelectedImage] = React.useState<string | null>(null)
    const [showSearch, setShowSearch] = React.useState(false)
    const [showThink, setShowThink] = React.useState(false)
    const [showCanvas, setShowCanvas] = React.useState(false)
    const uploadInputRef = React.useRef<HTMLInputElement>(null)
    const promptBoxRef = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
      if (typeof document === 'undefined') {
        return
      }

      const styleId = 'ai-prompt-box-scrollbar-styles'
      if (document.getElementById(styleId)) {
        return
      }

      const styleSheet = document.createElement('style')
      styleSheet.id = styleId
      styleSheet.innerText = styles
      document.head.appendChild(styleSheet)
    }, [])

    const handleToggleChange = (value: string) => {
      if (value === 'search') {
        setShowSearch((prev) => !prev)
        setShowThink(false)
      } else if (value === 'think') {
        setShowThink((prev) => !prev)
        setShowSearch(false)
      }
    }

    const handleCanvasToggle = () => setShowCanvas((prev) => !prev)

    const isImageFile = (file: File) => file.type.startsWith('image/')

    const processFile = (file: File) => {
      if (!isImageFile(file)) {
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        return
      }

      setFiles([file])
      const reader = new FileReader()
      reader.onload = (e) =>
        setFilePreviews({ [file.name]: e.target?.result as string })
      reader.readAsDataURL(file)
    }

    const handleDragOver = React.useCallback((e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }, [])

    const handleDragLeave = React.useCallback((e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }, [])

    const handleDrop = React.useCallback((e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const droppedFiles = Array.from(e.dataTransfer.files)
      const imageFiles = droppedFiles.filter((file) => isImageFile(file))
      if (imageFiles.length > 0) {
        processFile(imageFiles[0])
      }
    }, [])

    const handleRemoveFile = (index: number) => {
      const fileToRemove = files[index]
      if (fileToRemove && filePreviews[fileToRemove.name]) {
        setFilePreviews({})
      }
      setFiles([])
    }

    const openImageModal = (imageUrl: string) => setSelectedImage(imageUrl)

    const handlePaste = React.useCallback((e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) {
        return
      }

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile()
          if (file) {
            e.preventDefault()
            processFile(file)
            break
          }
        }
      }
    }, [])

    React.useEffect(() => {
      document.addEventListener('paste', handlePaste)
      return () => document.removeEventListener('paste', handlePaste)
    }, [handlePaste])

    const handleSubmit = () => {
      if (input.trim() || files.length > 0) {
        let messagePrefix = ''
        if (showSearch) {
          messagePrefix = '[Search: '
        } else if (showThink) {
          messagePrefix = '[Think: '
        } else if (showCanvas) {
          messagePrefix = '[Canvas: '
        }

        const formattedInput = messagePrefix ? `${messagePrefix}${input}]` : input
        onSend(formattedInput, files)
        setInput('')
        setFiles([])
        setFilePreviews({})
      }
    }

    const hasContent = input.trim() !== '' || files.length > 0

    return (
      <>
        <PromptInput
          value={input}
          onValueChange={setInput}
          isLoading={isLoading}
          onSubmit={handleSubmit}
          className={cn(
            'w-full border-border bg-background/80 transition-all duration-200 ease-in-out focus-within:border-foreground/40',
            className,
          )}
          disabled={isLoading}
          ref={ref || promptBoxRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-1 transition-all duration-300">
              {files.map((file, index) => (
                <div key={index} className="group relative">
                  {file.type.startsWith('image/') && filePreviews[file.name] && (
                    <div
                      className="h-16 w-16 cursor-pointer overflow-hidden rounded-xl transition-all duration-300"
                      onClick={() => openImageModal(filePreviews[file.name])}
                    >
                      <img
                        src={filePreviews[file.name]}
                        alt={file.name}
                        className="h-full w-full object-cover"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveFile(index)
                        }}
                        className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <PromptInputTextarea
            placeholder={
              showSearch
                ? 'Search the web...'
                : showThink
                  ? 'Think deeply...'
                  : showCanvas
                    ? 'Create on canvas...'
                    : placeholder
            }
            className="text-sm"
          />

          <PromptInputActions className="flex items-center justify-between gap-2 pt-2">
            <div className="flex items-center gap-1 transition-opacity duration-300">
              <PromptInputAction tooltip="Upload image">
                <button
                  onClick={() => uploadInputRef.current?.click()}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-secondary/70 hover:text-foreground"
                >
                  <Paperclip className="h-5 w-5 transition-colors" />
                  <input
                    ref={uploadInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        processFile(e.target.files[0])
                      }
                      if (e.target) {
                        e.target.value = ''
                      }
                    }}
                    accept="image/*"
                  />
                </button>
              </PromptInputAction>

              {leftActionsAddon}

              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => handleToggleChange('search')}
                  className={cn(
                    'flex h-8 items-center gap-1 rounded-md border px-2 py-1 transition-all duration-200',
                    showSearch
                      ? 'border-foreground/40 bg-secondary text-foreground'
                      : 'border-transparent bg-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                  )}
                >
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                    <motion.div
                      animate={{
                        y: showSearch ? -1 : 0,
                        scale: showSearch ? 1.04 : 1,
                      }}
                      whileHover={{
                        y: -1,
                        scale: 1.04,
                        transition: {
                          type: 'spring',
                          stiffness: 260,
                          damping: 18,
                        },
                      }}
                      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
                    >
                      <Globe
                        className={cn(
                          'h-4 w-4',
                          showSearch ? 'text-foreground' : 'text-inherit',
                        )}
                      />
                    </motion.div>
                  </div>
                  <AnimatePresence>
                    {showSearch && (
                      <motion.span
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 'auto', opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex-shrink-0 overflow-hidden whitespace-nowrap text-xs text-foreground"
                      >
                        web
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>

                <CustomDivider />

                <button
                  type="button"
                  onClick={() => handleToggleChange('think')}
                  className={cn(
                    'flex h-8 items-center gap-1 rounded-md border px-2 py-1 transition-all duration-200',
                    showThink
                      ? 'border-foreground/40 bg-secondary text-foreground'
                      : 'border-transparent bg-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                  )}
                >
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                    <motion.div
                      animate={{
                        y: showThink ? -1 : 0,
                        scale: showThink ? 1.04 : 1,
                      }}
                      whileHover={{
                        y: -1,
                        scale: 1.04,
                        transition: {
                          type: 'spring',
                          stiffness: 260,
                          damping: 18,
                        },
                      }}
                      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
                    >
                      <BrainCog
                        className={cn(
                          'h-4 w-4',
                          showThink ? 'text-foreground' : 'text-inherit',
                        )}
                      />
                    </motion.div>
                  </div>
                  <AnimatePresence>
                    {showThink && (
                      <motion.span
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 'auto', opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex-shrink-0 overflow-hidden whitespace-nowrap text-xs text-foreground"
                      >
                        reason
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>

                <CustomDivider />

                <button
                  type="button"
                  onClick={handleCanvasToggle}
                  className={cn(
                    'flex h-8 items-center gap-1 rounded-md border px-2 py-1 transition-all duration-200',
                    showCanvas
                      ? 'border-foreground/40 bg-secondary text-foreground'
                      : 'border-transparent bg-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                  )}
                >
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                    <motion.div
                      animate={{
                        y: showCanvas ? -1 : 0,
                        scale: showCanvas ? 1.04 : 1,
                      }}
                      whileHover={{
                        y: -1,
                        scale: 1.04,
                        transition: {
                          type: 'spring',
                          stiffness: 260,
                          damping: 18,
                        },
                      }}
                      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
                    >
                      <FolderCode
                        className={cn(
                          'h-4 w-4',
                          showCanvas ? 'text-foreground' : 'text-inherit',
                        )}
                      />
                    </motion.div>
                  </div>
                  <AnimatePresence>
                    {showCanvas && (
                      <motion.span
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 'auto', opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex-shrink-0 overflow-hidden whitespace-nowrap text-xs text-foreground"
                      >
                        code
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </div>
            </div>

            <PromptInputAction
              tooltip={
                isLoading
                  ? 'Stop generation'
                  : hasContent
                    ? 'Send message'
                    : 'Enter a message'
              }
            >
              <Button
                variant="default"
                size="icon"
                className={cn(
                  'h-8 w-8 rounded-md border border-transparent transition-all duration-200',
                  hasContent
                    ? 'border-foreground/40 bg-foreground text-background hover:opacity-90'
                    : 'bg-transparent text-muted-foreground',
                )}
                onClick={() => {
                  if (hasContent) {
                    handleSubmit()
                  }
                }}
                disabled={isLoading || !hasContent}
              >
                {isLoading ? (
                  <Square className="h-4 w-4 animate-pulse fill-background" />
                ) : (
                  <ChevronUp className={cn('h-4 w-4', hasContent ? 'text-background' : 'text-muted-foreground')} />
                )}
              </Button>
            </PromptInputAction>
          </PromptInputActions>
        </PromptInput>

        <ImageViewDialog
          imageUrl={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      </>
    )
  },
)
PromptInputBox.displayName = 'PromptInputBox'
