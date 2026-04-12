'use client'

import { PromptInputBox } from '@/components/ui/ai-prompt-box'

const DemoOne = () => {
  const handleSendMessage = (message: string, files?: File[]) => {
    console.log('Message:', message)
    console.log('Files:', files)
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[radial-gradient(125%_125%_at_50%_101%,rgba(245,87,2,1)_10.5%,rgba(245,120,2,1)_16%,rgba(245,140,2,1)_17.5%,rgba(245,170,100,1)_25%,rgba(238,174,202,1)_40%,rgba(202,179,214,1)_65%,rgba(148,201,233,1)_100%)]">
      <div className="w-[500px] p-4">
        <PromptInputBox onSend={handleSendMessage} />
      </div>
    </div>
  )
}

export { DemoOne }
