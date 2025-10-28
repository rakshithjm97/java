pipeline {
    agent any

    environment {
        PATH = "/usr/share/maven/bin:/usr/lib/jvm/java-17-amazon-corretto.x86_64/bin:${PATH}"
        MAVEN_OPTS = "-Dmaven.test.failure.ignore=true"
    }

    stages {
        stage('Checkout') {
            steps {
                echo "Fetching code from GitHub..."
                git branch: 'main', url: 'https://github.com/rakshithjm97/java.git'
            }
        }

        stage('Build') {
            steps {
                echo "Running Maven build..."
                sh 'mvn clean package'
            }
        }

        stage('Test') {
            steps {
                echo "Running tests..."
                sh 'mvn test'
            }
        }

        stage('Archive Artifacts') {
            steps {
                echo "Archiving WAR file..."
                archiveArtifacts artifacts: '**/target/*.war', fingerprint: true
            }
        }

        stage('Deploy') {
            when {
                expression { fileExists('Procfile') }
            }
            steps {
                echo "Deploying app (placeholder)..."
                // Example deploy: sh 'java -jar target/*.war'
            }
        }
    }

    post {
        success {
            echo '✅ Build succeeded!'
        }
        failure {
            echo '❌ Build failed.'
        }
    }
}
