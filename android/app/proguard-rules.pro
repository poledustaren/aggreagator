# Правила ProGuard/R8 для release-сборки.
# kotlinx.serialization требует сохранения сериализаторов сгенерированных классов.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class ru.aggregat.app.**$$serializer { *; }
-keepclassmembers class ru.aggregat.app.** {
    *** Companion;
}
-keepclasseswithmembers class ru.aggregat.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}
