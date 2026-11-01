; Passage de Plexr à Maku : le nom du produit a changé, l'installeur de Maku retire donc l'ancien
; Plexr (installé pour l'utilisateur), sans ses données ni sa configuration, qui sont gardées.
!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Plexr" "UninstallString"
  ${If} $R0 != ""
    ExecWait '$R0 /S'
  ${EndIf}
!macroend
