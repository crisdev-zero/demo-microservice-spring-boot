
-----

# **Guide: Deploying a Spring Boot Microservice to Google Cloud Run with Aiven MySQL via GitHub Actions**

This guide will walk you through setting up a CI/CD pipeline to deploy a Spring Boot application to Google Cloud Run, using a managed MySQL database from Aiven. We'll prioritize security by properly handling sensitive credentials.

-----

## **Part 1: Prerequisites & Initial Setup**

Before we dive in, ensure you have the following accounts and tools ready:

### 1\. **Accounts Needed:**

  * **GitHub Account:** For storing your code and running automated deployments.
  * **Google Cloud Platform (GCP) Account:** For deploying your application (Cloud Run, Artifact Registry).
      * **Crucial:** Ensure **billing is enabled** on your GCP project. Cloud Run has a generous free tier, but many services require billing to be active. Set up budget alerts if you're concerned about costs.
  * **Aiven Account:** For your managed MySQL database.

### 2\. **Tools to Install (Locally):**

  * **Git:** For version control. [https://git-scm.com/downloads](https://git-scm.com/downloads)
  * **Java Development Kit (JDK) 17 or higher:** Spring Boot 3.x requires JDK 17+. [https://adoptium.net/temurin/releases/](https://adoptium.net/temurin/releases/)
  * **Maven:** For building your Spring Boot project. [https://maven.apache.org/download.cgi](https://maven.apache.org/download.cgi)
  * **Docker Desktop:** (**Not required, only to test docker locally, otherwise, skip**)  For building and testing Docker images locally. [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)

-----

## **Part 2: Aiven MySQL Database Setup**

Your Spring Boot application will connect to a MySQL database managed by Aiven.

1.  **Create an Aiven MySQL Service:**

      * Log in to your Aiven account.
      * Create a new MySQL service. Choose your desired cloud provider (e.g., Google Cloud) and region (ideally, choose a region close to where you'll deploy your Cloud Run service for lower latency, like `us-central1` or `southamerica-east1`).
      * Select MySQL version 8.0 or newer.

2.  **Retrieve Aiven MySQL Credentials:**

      * Once your MySQL service is provisioned, go to its "Overview" page.
      * Find the **"Connection information"** section. You'll need:
          * **Host:** (e.g., `mysql-projectname-xxxxxxxx.aivencloud.com`)
          * **Port:** (e.g., `12345`)
          * **Database Name:** (e.g., `defaultdb`)
          * **Username:** (e.g., `avnadmin`)
          * **Password:** (click to generate or view)
          * **SSL Mode:** Aiven typically requires SSL. Keep note of their recommended SSL parameters for the JDBC URL (usually `requireSSL=true&verifyServerCertificate=false` or similar).

3.  **Configure Aiven MySQL Service Firewall (Important\!):**

      * By default, Aiven services might restrict access to specific IP addresses. Cloud Run instances have **dynamic, ephemeral IP addresses** that change.
      * For a Proof of Concept (PoC) or initial testing, you can temporarily **add `0.0.0.0/0` to your Aiven MySQL firewall rules** to allow connections from any IP.
          * In your Aiven console, navigate to your MySQL service.
          * Find the "Networking" or "Access Control" section.
          * Add a new IP allowlist entry: `0.0.0.0/0`.
      * **CRITICAL SECURITY NOTE:** Allowing `0.0.0.0/0` is **NOT recommended for production environments** as it allows anyone from the internet to attempt to connect. For production, you would typically use a Google Cloud VPC Access Connector for private networking or more advanced IP management if Aiven supports it with your chosen cloud. **Remember to remove this rule or restrict it after successful testing if not intended for long-term use.**

4. **Test connection to Aiven**

    * Can be tested with the connection string, from any viewer (ex: DBeaver) from local machine. If an error is got from the URL string, try appending this parameter to the default query provided by Aiven: `allowPublicKeyRetrieval=TRUE`

-----

## **Part 3: Spring Boot Project Setup**

Create your Spring Boot application and configure it for Dockerization and externalized database access.

1.  **Generate Spring Boot Project:**

      * Go to Spring Initializr: [https://start.spring.io/](https://start.spring.io/)

      * **Project:** Maven Project

      * **Language:** Java

      * **Spring Boot:** Latest stable (as of May 2025, Spring Boot 3.5.0)

      * **Project Metadata:**

          * **Group:** `com.example`
          * **Artifact:** `demo-microservice-spring-boot` (or `post-microservice` as used in our example)
          * **Name:** `DemoMicroserviceSpringBoot`
          * **Package Name:** `com.example.demomicroservice`
          * **Packaging:** Jar
          * **Java:** 17

      * **Dependencies:** Add the following:

          * `Spring Web`
          * `Spring Data JPA`
          * `MySQL Driver`
          * `Thymeleaf` (for a simple UI)

      * Click **"GENERATE"** and download the ZIP file.

      * Extract the ZIP file. This will be your project root (e.g., `demo-microservice-spring-boot`).

2.  **`pom.xml` Verification:**

      * Open `pom.xml` in your project root.
      * Ensure the `mysql-connector-java` dependency is present and up-to-date (typically, Maven will select a compatible version with Spring Boot 3.x, currently MySQL Connector/J 8.x is used).

3.  **`src/main/resources/application.properties` Configuration:**

      * Open `src/main/resources/application.properties`.
      * **Crucial:** We will NOT hardcode sensitive database credentials here for the final remote deployment. Spring Boot can read these from environment variables.
      * For **LOCAL TESTING ONLY**, you can temporarily add your Aiven MySQL credentials here. **Remember to REMOVE these lines before pushing to GitHub for deployment\!**

    <!-- end list -->

    ```properties
    # Server Port (Cloud Run usually maps to 8080)
    server.port=8080

    # JPA/Hibernate Configuration
    # Creates/updates tables based on entities
    spring.jpa.hibernate.ddl-auto=update
    # Show SQL queries in logs
    spring.jpa.show-sql=true
    spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQL8Dialect

    # Thymeleaf Configuration (if you're using Thymeleaf for a web UI)
    spring.thymeleaf.cache=false
    spring.thymeleaf.prefix=classpath:/templates/
    spring.thymeleaf.suffix=.html

    # --- FOR LOCAL TESTING ONLY ---
    # After successful local testing, DELETE these lines before committing to Git!
    # Replace <YOUR_AIVEN_HOST>, <YOUR_AIVEN_PORT>, <YOUR_AIVEN_DATABASE>,
    # <YOUR_AIVEN_USER>, <YOUR_AIVEN_PASSWORD> with your actual Aiven credentials.
    spring.datasource.url=jdbc:mysql://<YOUR_AIVEN_HOST>:<YOUR_AIVEN_PORT>/<YOUR_AIVEN_DATABASE>?reconnect=true&useSSL=true&requireSSL=true
    spring.datasource.username=<YOUR_AIVEN_USER>
    spring.datasource.password=<YOUR_AIVEN_PASSWORD>
    spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver
    # --- END LOCAL TESTING SECTION ---
    ```

4.  **Create a Simple Spring Boot Application (Example: A "Post Board"):**

      * **`src/main/java/com/example/demomicroservice/DemoMicroserviceApplication.java`**
        ```java
        package com.example.demomicroservice;

        import org.springframework.boot.SpringApplication;
        import org.springframework.boot.autoconfigure.SpringBootApplication;

        @SpringBootApplication
        public class DemoMicroserviceApplication {

            public static void main(String[] args) {
                SpringApplication.run(DemoMicroserviceApplication.class, args);
            }

        }
        ```
      * **`src/main/java/com/example/demomicroservice/Post.java` (JPA Entity)**
        ```java
        package com.example.demomicroservice;

        import jakarta.persistence.Entity;
        import jakarta.persistence.GeneratedValue;
        import jakarta.persistence.GenerationType;
        import jakarta.persistence.Id;
        import java.time.LocalDateTime;

        @Entity
        public class Post {
            @Id
            @GeneratedValue(strategy = GenerationType.IDENTITY)
            private Long id;
            private String title;
            private String content;
            private LocalDateTime createdAt;

            public Post() {
                this.createdAt = LocalDateTime.now(); // Set creation time on new post
            }

            // Getters and Setters
            public Long getId() { return id; }
            public void setId(Long id) { this.id = id; }
            public String getTitle() { return title; }
            public void setTitle(String title) { this.title = title; }
            public String getContent() { return content; }
            public void setContent(String content) { this.content = content; }
            public LocalDateTime getCreatedAt() { return createdAt; }
            public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
        }
        ```
      * **`src/main/java/com/example/demomicroservice/PostRepository.java` (JPA Repository)**
        ```java
        package com.example.demomicroservice;

        import org.springframework.data.jpa.repository.JpaRepository;
        import java.util.List;

        public interface PostRepository extends JpaRepository<Post, Long> {
            List<Post> findAllByOrderByIdDesc(); // Method to retrieve posts by ID in descending order
        }
        ```
      * **`src/main/java/com/example/demomicroservice/PostController.java` (Spring MVC Controller)**
        ```java
        package com.example.demomicroservice;

        import org.springframework.beans.factory.annotation.Autowired;
        import org.springframework.stereotype.Controller;
        import org.springframework.ui.Model;
        import org.springframework.web.bind.annotation.GetMapping;
        import org.springframework.web.bind.annotation.ModelAttribute;
        import org.springframework.web.bind.annotation.PostMapping;

        @Controller
        public class PostController {

            @Autowired
            private PostRepository postRepository;

            @GetMapping("/")
            public String index(Model model) {
                model.addAttribute("newPost", new Post());
                model.addAttribute("posts", postRepository.findAllByOrderByIdDesc());
                return "index";
            }

            @PostMapping("/posts")
            public String createPost(@ModelAttribute Post post) {
                postRepository.save(post);
                return "redirect:/";
            }
        }
        ```
      * **`src/main/resources/templates/index.html` (Thymeleaf UI)**
        ```html
        <!DOCTYPE html>
        <html xmlns:th="http://www.thymeleaf.org">
        <head>
            <title>Post Board</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; background-color: #f4f4f4; }
                .container { max-width: 800px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                h1, h2 { color: #333; }
                form { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #f9f9f9; }
                form label { display: block; margin-bottom: 5px; font-weight: bold; }
                form input[type="text"], form textarea { width: calc(100% - 22px); padding: 10px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px; }
                form button { background-color: #007bff; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
                form button:hover { background-color: #0056b3; }
                .post-list { margin-top: 20px; }
                .post-item { background: #e9ecef; padding: 15px; margin-bottom: 10px; border-radius: 5px; }
                .post-item h3 { margin-top: 0; color: #0056b3; }
                .post-item p { margin-bottom: 5px; color: #555; }
                .post-item small { display: block; text-align: right; color: #777; font-size: 0.8em; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Post Board</h1>

                <h2>Create New Post</h2>
                <form th:action="@{/posts}" th:object="${newPost}" method="post">
                    <label for="title">Title:</label>
                    <input type="text" id="title" th:field="*{title}" required />

                    <label for="content">Content:</label>
                    <textarea id="content" th:field="*{content}" rows="4" required></textarea>

                    <button type="submit">Add Post</button>
                </form>

                <h2>Recent Posts</h2>
                <div class="post-list">
                    <div th:each="post : ${posts}" class="post-item">
                        <h3 th:text="${post.title}">Post Title</h3>
                        <p th:text="${post.content}">Post Content</p>
                        <small th:text="${#temporals.format(post.createdAt, 'yyyy-MM-dd HH:mm')}">2025-01-01 12:00</small>
                    </div>
                    <p th:if="${posts.isEmpty()}">No posts yet. Be the first to add one!</p>
                </div>
            </div>
        </body>
        </html>
        ```

5.  **Local Testing (Crucial\!):**

      * Open your terminal in the `demo-microservice-spring-boot` project root.
      * Run the application: `mvn spring-boot:run`
      * Wait until you see "Tomcat started on port 8080" and "Started DemoMicroserviceApplication".
      * Open your web browser and navigate to: `http://localhost:8080`
      * Test by creating a new post. If it saves and displays, your application logic and local Aiven MySQL connection are working.

6.  **Clean Up `application.properties` (Very Important\!):**

      * Once local testing is successful, **DELETE** the Aiven MySQL database connection lines from `src/main/resources/application.properties`.
      * Your `application.properties` should now look like the "clean" example shown in Step 3. This ensures no sensitive credentials are committed to your Git repository.

-----

## **Part 4: Dockerize Your Spring Boot Application**

We'll create a `Dockerfile` to package your application into a Docker image, ready for Cloud Run.

1.  **Create `Dockerfile`:**

      * In your `demo-microservice-spring-boot` project root (next to `pom.xml`), create a file named `Dockerfile` (no extension).
      * Add the following content:

    <!-- end list -->

    ```dockerfile
    # Use a lightweight Java 17 runtime image
    FROM eclipse-temurin:17-jdk-alpine

    # Set the working directory in the container
    WORKDIR /app

    # Copy the Maven build artifacts from your local target directory
    # The `mvn package` command creates the JAR in target/
    COPY target/demo-microservice-spring-boot-*.jar app.jar

    # Expose the port your Spring Boot application runs on (default is 8080)
    EXPOSE 8080

    # Run the Spring Boot application when the container starts
    ENTRYPOINT ["java", "-jar", "app.jar"]
    ```

2.  **Create `.dockerignore`:**

      * In your `demo-microservice-spring-boot` project root, create a file named `.dockerignore`.
      * This file works like `.gitignore` for Docker builds, preventing unnecessary files from being copied into your image.
      * Add the following content:

    <!-- end list -->

    ```
    .git
    .gitignore
    .mvn/
    mvnw
    mvnw.cmd
    target/
    .idea/
    *.iml
    **/.DS_Store
    **/node_modules/
    ```

-----

## **Part 5: Google Cloud Platform (GCP) Setup**

Configure your GCP project for Cloud Run and Artifact Registry.

1.  **Select Your GCP Project:**

      * Go to [https://console.cloud.google.com/](https://console.cloud.google.com/).
      * In the top bar, select your Google Cloud project (e.g., `my-springboot-poc-project-12345`). Make a note of your **Project ID**.

2.  **Enable Required APIs:**

      * In the GCP Console, go to **"APIs & Services" \> "Enabled APIs & services"**.
      * Ensure the following APIs are **Enabled**:
          * `Cloud Run Admin API`
          * `Cloud Build API`
          * `Artifact Registry API`
          * `IAM API` (usually enabled by default)

3.  **Create a Service Account for GitHub Actions:**

      * This is a dedicated identity for your GitHub Actions workflow to interact with GCP securely.
      * In GCP Console, go to **"IAM & Admin" \> "Service Accounts"**.
      * Click **"+ CREATE SERVICE ACCOUNT"**.
      * **Service account name:** `github-actions-deployer`
      * **Service account ID:** (auto-generated, e.g., `github-actions-deployer@your-project-id.iam.gserviceaccount.com`)
      * Click **"DONE"**.

4.  **Grant Roles to the Service Account (Crucial for Permissions\!):**

      * After creating the service account, find it in the list (`github-actions-deployer@...`).
      * Click the **pencil icon (Edit Principal)** next to it.
      * Click **"+ ADD ANOTHER ROLE"** and add the following roles:
          * `Cloud Run Admin`: Allows deploying and managing Cloud Run services.
          * `Service Account User`: Allows the service account to impersonate itself for authentication.
          * `Artifact Registry Writer`: Allows pushing Docker images to Artifact Registry.
          * **`Artifact Registry Administrator`**: **This is the key fix for the "PERMISSION\_DENIED" error we faced\!** It allows the service account to *create* new Artifact Registry repositories if they don't exist, in addition to writing to them.
          * `Cloud Build Editor`: Allows Cloud Build to be triggered (even if you're not explicitly using Cloud Build, some background operations for building/pushing might interact with it).
      * Click **"SAVE"**.

5.  **Generate a JSON Key for the Service Account:**

      * In GCP Console, go to **"IAM & Admin" \> "Service Accounts"**.
      * Find `github-actions-deployer@...` and click on its name.
      * Go to the **"Keys"** tab.
      * Click **"ADD KEY" \> "Create new key"**.
      * Select **"JSON"** as the key type.
      * Click **"CREATE"**. This will download a JSON file to your computer. **Keep this file secure; it's sensitive\!** You'll need its content in the next step.

-----

## **Part 6: GitHub Repository & Secrets Setup**

Your GitHub repository will host your code and the CI/CD workflow, along with secure secrets.

1.  **Create a GitHub Repository:**

      * Go to GitHub.com and create a **new public repository**.
      * **Repository name:** `springboot-mysql-poc` (or matching your project name, e.g., `demo-microservice-spring-boot`).
      * **Visibility:** Public (or private, but our guide assumes public for simplicity of initial URL access).
      * **Do NOT initialize with a README, .gitignore, or license.** You'll push your existing local project.

2.  **Initialize Git & Push Your Project:**

      * Open your terminal in your `demo-microservice-spring-boot` project root (where `pom.xml`, `Dockerfile`, etc., are located).
      * Initialize a Git repository:
        ```bash
        git init
        ```
      * Add all your files:
        ```bash
        git add .
        ```
      * Commit your changes:
        ```bash
        git commit -m "Initial commit of Spring Boot microservice"
        ```
      * Rename your default branch to `main`:
        ```bash
        git branch -M main
        ```
      * Link your local repository to your new GitHub repository (replace `YOUR_GITHUB_USERNAME` and `YOUR_REPO_NAME`):
        ```bash
        git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git
        ```
      * Push your code to GitHub:
        ```bash
        git push -u origin main
        ```

3.  **Create GitHub Repository Secrets (CRITICAL SECURITY STEP\!):**

      * **These secrets store sensitive credentials and environment variables, ensuring they are NEVER hardcoded in your public repository.**

      * In your GitHub repository (e.g., `https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME`), go to **"Settings" \> "Secrets and variables" \> "Actions"**.

      * Click **"New repository secret"** for each of the following:

      * **`GCP_SA_KEY`**:

          * **Value:** Open the JSON key file you downloaded for your `github-actions-deployer` service account. **Copy the ENTIRE content of the JSON file** and paste it into the "Secret" field.
          * Click "Add secret".

      * **`DB_URL`**:

          * **Value:** Your Aiven MySQL JDBC URL. (e.g., `jdbc:mysql://<YOUR_AIVEN_HOST>:<YOUR_AIVEN_PORT>/<YOUR_AIVEN_DATABASE>?reconnect=true&useSSL=true&requireSSL=true`)
          * Click "Add secret".

      * **`DB_USER`**:

          * **Value:** Your Aiven MySQL username (e.g., `avnadmin`).
          * Click "Add secret".

      * **`DB_PASSWORD`**:

          * **Value:** Your Aiven MySQL password.
          * Click "Add secret".

-----

## **Part 7: GitHub Actions Workflow (`deploy.yml`)**

This file defines the automated steps to build, push, and deploy your application.

1.  **Create Workflow Directory:**

      * In your `demo-microservice-spring-boot` project root, create a directory structure: `.github/workflows/`

2.  **Create `deploy.yml`:**

      * Inside the `.github/workflows/` directory, create a file named `deploy.yml`.
      * Add the following content. **Remember to replace placeholder values like `your-gcp-project-id` with your actual IDs/names\!**

    <!-- end list -->

    ```yaml
    name: Deploy to Cloud Run

    on:
      push:
        branches:
          - main # Trigger on pushes to the main branch

    env:
      # These are configuration values YOU define.
      # Replace 'your-gcp-project-id' with your actual Google Cloud Project ID.
      PROJECT_ID: your-gcp-project-id # e.g., my-springboot-poc-project-12345
      SERVICE_NAME: post-microservice   # Name for your Cloud Run service (e.g., 'post-microservice')
      REGION: us-central1               # Google Cloud region (e.g., us-central1, southamerica-east1)
      ARTIFACT_REGISTRY_REPO: my-app-images # Name for your Artifact Registry repository (e.g., 'springboot-images')

    jobs:
      deploy:
        runs-on: ubuntu-latest
        steps:
          - name: Checkout Repository
            uses: actions/checkout@v4

          - name: Set up JDK 17
            uses: actions/setup-java@v4
            with:
              distribution: 'temurin'
              java-version: '17' # Ensure this matches your project's Java version

          - name: Cache Maven dependencies
            uses: actions/cache@v4
            with:
              path: ~/.m2/repository
              key: ${{ runner.os }}-maven-${{ hashFiles('**/pom.xml') }}
              restore-keys: |
                ${{ runner.os }}-maven-

          - name: Build with Maven
            run: mvn clean install -DskipTests # -DskipTests to skip tests during CI build for speed

          - name: Authenticate Google Cloud CLI
            id: auth
            uses: google-github-actions/auth@v2
            with:
              credentials_json: ${{ secrets.GCP_SA_KEY }} # Uses the securely stored GitHub Secret

          - name: Set up Cloud SDK
            uses: google-github-actions/setup-gcloud@v2
            with:
              project_id: ${{ env.PROJECT_ID }}

          - name: Configure Docker to use Artifact Registry
            run: gcloud auth configure-docker ${{ env.REGION }}-docker.pkg.dev

          - name: Build and Push Docker image to Artifact Registry
            run: |
              # This command attempts to describe (check for existence) the Artifact Registry repository.
              # If it's not found (NOT_FOUND error), the '||' operator executes the next command,
              # which is to create the repository. This is where the 'Artifact Registry Administrator'
              # role was crucial to solve the PERMISSION_DENIED error.
              gcloud artifacts repositories describe ${{ env.ARTIFACT_REGISTRY_REPO }} --location=${{ env.REGION }} --project=${{ env.PROJECT_ID }} || \
              gcloud artifacts repositories create ${{ env.ARTIFACT_REGISTRY_REPO }} --repository-format=docker --location=${{ env.REGION }} --project=${{ env.PROJECT_ID }} --description="Docker repository for Spring Boot apps"

              # Define the full Docker image path for Artifact Registry
              IMAGE_NAME=${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.ARTIFACT_REGISTRY_REPO }}/${{ env.SERVICE_NAME }}:${{ github.sha }}

              # Build the Docker image using the Dockerfile in the project root
              docker build -t $IMAGE_NAME .

              # Push the built Docker image to Artifact Registry
              docker push $IMAGE_NAME
            # Note: MAVEN_OPTS environment variable here is specifically for the Maven build phase,
            # not directly related to Docker or Cloud Run runtime. It can help if Maven
            # struggles with SSL certificate validation when fetching dependencies.
            env:
              MAVEN_OPTS: "-Dmaven.wagon.http.ssl.insecure=true -Dmaven.wagon.http.ssl.allowall=true -Dmaven.wagon.http.ssl.ignore.validity-dates=true"

          - name: Deploy to Google Cloud Run
            run: |
              gcloud run deploy ${{ env.SERVICE_NAME }} \
                --image ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.ARTIFACT_REGISTRY_REPO }}/${{ env.SERVICE_NAME }}:${{ github.sha }} \
                --region ${{ env.REGION }} \
                --platform managed \
                --allow-unauthenticated \
                --set-env-vars "SPRING_DATASOURCE_URL=${{ secrets.DB_URL }}" \
                --set-env-vars "SPRING_DATASOURCE_USERNAME=${{ secrets.DB_USER }}" \
                --set-env-vars "SPRING_DATASOURCE_PASSWORD=${{ secrets.DB_PASSWORD }}" \
                --set-env-vars "SPRING_JPA_HIBERNATE_DDL_AUTO=update" # Ensure DDL auto is set for initial deployment
            # These env vars are injected securely into the Cloud Run container at deploy time.
            # They override any settings in application.properties.
    ```

-----

## **Part 8: Triggering the Deployment & Verification**

Now, push your changes to GitHub to kick off the CI/CD pipeline\!

1.  **Commit and Push Your Changes:**

      * Make sure you've:
          * **Removed** the local `spring.datasource.*` lines from `application.properties`.
          * **Created** the `.github/workflows/deploy.yml` file with your specific `PROJECT_ID`, `SERVICE_NAME`, `REGION`, `ARTIFACT_REGISTRY_REPO`.
          * **Created** the `Dockerfile` and `.dockerignore`.
      * Open your terminal in your project root.
      * Add the new/modified files:
        ```bash
        git add .github/workflows/deploy.yml Dockerfile .dockerignore src/main/resources/application.properties
        ```
      * Commit the changes:
        ```bash
        git commit -m "Add GitHub Actions workflow for Cloud Run deployment and remove local DB creds"
        ```
      * Push to `main`:
        ```bash
        git push origin main
        ```

2.  **Monitor GitHub Actions:**

      * Immediately go to your GitHub repository -\> **"Actions"** tab.
      * You'll see a new workflow run triggered by your push to `main`.
      * Click on the running workflow to view the live logs. Watch each step as it executes.
      * **Expect initial failures for "Artifact Registry Administrator" if it's the very first run and the role wasn't granted before the push.** If you see `PERMISSION_DENIED` related to `artifactregistry.repositories.create`, follow the **Solution** in Part 5, Step 4, then re-run the workflow from the GitHub Actions interface.

3.  **Verify Cloud Run Deployment:**

      * Once the GitHub Actions workflow shows all green checkmarks:
          * Go to Google Cloud Console -\> **Cloud Run**.
          * You should see your `post-microservice` (or your chosen `SERVICE_NAME`) listed.
          * Click on the service name.
          * At the top of the service details page, find the **"URL"**. Copy this URL.

4.  **Test Your Live Application:**

      * Paste the copied Cloud Run URL into your web browser.
      * You should see your Spring Boot "Post Board" application UI.
      * **Crucially, try adding a new post.** If it saves and displays correctly, it means:
          * Your Spring Boot app started successfully in Cloud Run.
          * It successfully connected to your Aiven MySQL database using the credentials securely passed as environment variables from GitHub Secrets.

### **Troubleshooting Tips (If things don't work):**

  * **Cloud Run Logs are Your Best Friend:**
      * In the Cloud Run service details page, go to the **"Logs"** tab.
      * Look for `ERROR` or `WARNING` messages.
      * Common issues here include:
          * **Application startup failure:** Look for Spring Boot exceptions.
          * **Database connection errors:** Search for `SQLException`, `Connection refused`, `Access denied`, `Timed out`. This indicates problems with credentials, Aiven firewall, or network configuration.
  * **Aiven MySQL Firewall:** If logs show connection timeouts or refusals, double-check that `0.0.0.0/0` is temporarily added to your Aiven MySQL firewall rules (as discussed in Part 2, Step 3).
  * **GitHub Secrets Accuracy:** Re-verify that the `DB_URL`, `DB_USER`, and `DB_PASSWORD` values in your GitHub secrets are exact copies of your Aiven credentials (no typos, extra spaces, etc.).
  * **Environment Variables in Cloud Run:** In Cloud Run service details, go to the "Revisions" tab, click your latest revision, and then the "Container" tab. Scroll down to "Variables and secrets" to confirm `SPRING_DATASOURCE_URL`, `_USERNAME`, `_PASSWORD` are listed (even if masked).

-----

This comprehensive guide should equip your friend with all the knowledge needed to replicate your successful deployment. Good luck\!