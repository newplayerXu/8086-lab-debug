.8086                       ; 只使用 8086 指令
.model small                ; 一个代码段、一个数据段
.stack 100h                 ; 分配 256 字节堆栈

.data
    num1    dw 5            ; 16 位整数
    num2    dw 3
    result  dw 0
    message db 'Calculation finished!$'

.code
main proc
    ; 初始化数据段寄存器
    mov ax, @data
    mov ds, ax

    ; 运算：5 + 3 = 8
    mov ax, num1            ; AX = 0005h
    mov bx, num2            ; BX = 0003h
    add ax, bx              ; AX = 0008h
    mov result, ax          ; result = 8

    ; 测试堆栈
    push ax                 ; SP 减少 2，保存 AX
    mov ax, 0               ; AX = 0000h
    pop cx                  ; CX = 0008h，SP 恢复

    ; 测试零标志位
    cmp cx, 8               ; 相等，因此 ZF = 1
    nop                     ; 可在这里设断点，观察结果

    ; 输出提示字符串
    mov dx, offset message
    mov ah, 09h
    int 21h

    ; 返回 DOS
    mov ax, 4C00h
    int 21h
main endp

end main                    ; 指定程序入口
