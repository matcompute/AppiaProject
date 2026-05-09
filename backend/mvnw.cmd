@REM ----------------------------------------------------------------------------
@REM Maven Wrapper startup batch script — Appia Backend
@REM ----------------------------------------------------------------------------
@IF "%__MVNW_ARG0_NAME__%"=="" (SET __MVNW_ARG0_NAME__=%~nx0)
@SET @@MVNW_CMD=%~dp0mvnw.cmd
@SET @@MVNW_JAVA_EXE=java
@SET MAVEN_PROJECTBASEDIR=%~dp0

@SET MVNW_REPOURL=https://repo.maven.apache.org/maven2
@SET MVNW_LAUNCHER=org.apache.maven.wrapper.MavenWrapperMain

@SET MAVEN_WRAPPER_JAR=%MAVEN_PROJECTBASEDIR%.mvn\wrapper\maven-wrapper.jar

@IF NOT EXIST "%MAVEN_WRAPPER_JAR%" (
  @echo Downloading Maven Wrapper...
  @SET DOWNLOAD_URL=%MVNW_REPOURL%/org/apache/maven/wrapper/maven-wrapper/3.2.0/maven-wrapper-3.2.0.jar
  @IF EXIST "%JAVA_HOME%\bin\jar.exe" (
    @"%JAVA_HOME%\bin\jar.exe" -xf "%MAVEN_WRAPPER_JAR%" 2>NUL
  )
  @powershell -Command "&{"^
    "$webclient = new-object System.Net.WebClient;"^
    "if (-not ([string]::IsNullOrEmpty('%MVNW_USERNAME%') -and [string]::IsNullOrEmpty('%MVNW_PASSWORD%'))) {"^
    "$webclient.Credentials = new-object System.Net.NetworkCredential('%MVNW_USERNAME%', '%MVNW_PASSWORD%');"^
    "}"^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;"^
    "$webclient.DownloadFile('%DOWNLOAD_URL%', '%MAVEN_WRAPPER_JAR%')"^
    "}"
)

@SET WRAPPER_LAUNCHER=org.apache.maven.wrapper.MavenWrapperMain
@SET DOWNLOAD_URL=%MVNW_REPOURL%/org/apache/maven/apache-maven/3.9.6/apache-maven-3.9.6-bin.zip

%@@MVNW_JAVA_EXE% ^
  -classpath "%MAVEN_WRAPPER_JAR%" ^
  "-Dmaven.multiModuleProjectDirectory=%MAVEN_PROJECTBASEDIR%" ^
  %WRAPPER_LAUNCHER% %*
