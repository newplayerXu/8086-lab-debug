; DOS COM: plain ORG 100H source, no Python setup.
ORG 100H
START:
    MOV AX,5
    MOV BX,3
    ADD AX,BX
    MOV RESULT,AX
    PUSH AX
    POP CX
    LEA DX,MESSAGE
    MOV AH,09H
    INT 21H
    MOV AX,4C00H
    INT 21H
RESULT DW 0
MESSAGE DB 'COM calculation finished!$'
END START
